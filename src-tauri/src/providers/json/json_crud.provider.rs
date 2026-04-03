/* sys lib */
use async_trait::async_trait;
use serde_json::{from_str, json, to_string_pretty, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::fs;
use tokio::sync::Mutex as AsyncMutex;

/* providers */
use crate::errors::ApiResult;
use crate::providers::base_crud::CrudProvider;

/* helpers */
use crate::helpers::common::supportsSoftDelete;
use crate::helpers::model_helper::ensureRequiredFields;

/// JsonCrudProvider - CRUD operations for JSON file storage
///
/// `tableLocks` serialises concurrent writes to the same JSON file.
/// The outer `std::sync::Mutex` is only held for the brief, non-async
/// lookup/insert of the per-table `tokio::sync::Mutex` — it is never
/// held across an `.await` point.
#[derive(Clone)]
pub struct JsonCrudProvider {
  pub dbFilePath: PathBuf,
  tableLocks: Arc<Mutex<HashMap<String, Arc<AsyncMutex<()>>>>>,
}

impl JsonCrudProvider {
  fn getTableLock(&self, nameTable: &str) -> Arc<AsyncMutex<()>> {
    let mut locks = self.tableLocks.lock().unwrap();
    locks
      .entry(nameTable.to_string())
      .or_insert_with(|| Arc::new(AsyncMutex::new(())))
      .clone()
  }
}

impl JsonCrudProvider {
  pub fn new(dbFilePath: PathBuf) -> Self {
    Self {
      dbFilePath,
      tableLocks: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  /// Strip nested relation fields from data before saving to prevent storing embedded relations.
  /// Only scalar IDs (userId, assignees, categories as IDs) belong in JSON; no user/profile objects.
  fn stripNestedRelations(table: &str, mut data: Value) -> Value {
    if let Some(obj) = data.as_object_mut() {
      match table {
        "todos" => {
          obj.remove("tasks");
          obj.remove("subtasks");
          obj.remove("user");
          obj.remove("assigneesProfiles");
          // categories: keep only if array of strings (IDs); strip if array of objects
          if let Some(cats) = obj.get("categories").and_then(|c| c.as_array()) {
            if cats.first().map_or(false, |c| c.is_object()) {
              obj.remove("categories");
            }
          }
        }
        "tasks" => {
          obj.remove("subtasks");
        }
        "subtasks" => {}
        _ => {}
      }
    }
    data
  }

  /// Relation keys that must not be written into JSON for a table (used in update path).
  /// Comments are stored inline on tasks/subtasks so we do not skip them there.
  fn relationKeysToSkip(table: &str) -> &'static [&'static str] {
    match table {
      "todos" => &["tasks", "subtasks", "comments", "user", "assigneesProfiles"],
      "tasks" => &["subtasks"],
      "subtasks" => &[],
      _ => &[],
    }
  }

  /// Resolve category IDs in a todo record to full Category objects.
  /// Reads categories.json and replaces string IDs with full category objects.
  async fn resolveTodoCategories(&self, mut record: Value) -> Value {
    if let Some(todo_obj) = record.as_object_mut() {
      if let Some(cat_ids) = todo_obj.get("categories").and_then(|c| c.as_array()) {
        let id_strings: Vec<String> = cat_ids
          .iter()
          .filter_map(|v| v.as_str().map(|s| s.to_string()))
          .collect();

        if !id_strings.is_empty() {
          let categories_path = self.getTablePath("categories");
          if let Ok(content) = fs::read_to_string(&categories_path).await {
            if let Ok(all_categories) =
              from_str::<Vec<Value>>(&content)
            {
              let resolved: Vec<Value> = id_strings
                .iter()
                .filter_map(|id| {
                  all_categories.iter().find(|c| {
                    c.get("id").and_then(|v| v.as_str()) == Some(id)
                  }).cloned()
                })
                .collect();

              if !resolved.is_empty() {
                todo_obj.insert("categories".to_string(), Value::Array(resolved));
              }
            }
          }
        }
      }
    }
    record
  }

  fn getTablePath(&self, nameTable: &str) -> PathBuf {
    let mut path = self.dbFilePath.clone();
    path.push(format!("{}.json", nameTable));
    path
  }

  pub async fn getDataTable(&self, nameTable: &str) -> ApiResult<Vec<Value>> {
    let tablePath = self.getTablePath(nameTable);

    if let Some(parentDir) = tablePath.parent() {
      fs::create_dir_all(parentDir)
        .await
        .map_err(|e| e.to_string())?;
    }

    if !tablePath.exists() {
      fs::write(&tablePath, "[]")
        .await
        .map_err(|e| e.to_string())?;
      return Ok(Vec::new());
    }

    let content = fs::read_to_string(&tablePath)
      .await
      .map_err(|e| e.to_string())?;

    if content.trim().is_empty() {
      return Ok(vec![]);
    }

    let data: Vec<Value> = from_str::<Vec<Value>>(&content)?;

    Ok(data)
  }

  pub async fn saveDataTable(&self, nameTable: &str, data: &Vec<Value>) -> ApiResult<()> {
    let tablePath = self.getTablePath(nameTable);

    // Ensure directory exists
    if let Some(parent) = tablePath.parent() {
      if let Err(e) = fs::create_dir_all(parent).await {
        return Err(format!("Failed to create directory: {}", e).into());
      }
    }

    let jsonString = to_string_pretty(data)?;

    let tempPath = tablePath.with_extension("tmp");

    if let Err(e) = fs::write(&tempPath, &jsonString).await {
      let _ = fs::remove_file(&tempPath).await;
      return Err(format!("Failed to write temp file: {}", e).into());
    }

    if let Err(e) = fs::rename(&tempPath, &tablePath).await {
      let _ = fs::remove_file(&tempPath).await;
      return Err(format!("Failed to rename file: {}", e).into());
    }

    Ok(())
  }

  pub async fn updateAll(&self, nameTable: &str, records: Vec<Value>) -> ApiResult<bool> {
    let _lock = self.getTableLock(nameTable).lock_owned().await;
    let mut existingRecords = self.getDataTable(nameTable).await?;

    // Strip nested relations from all incoming records before processing
    let cleanRecords: Vec<Value> = records
      .into_iter()
      .map(|record| Self::stripNestedRelations(nameTable, record))
      .collect();

    let newRecordsMap: std::collections::HashMap<String, &Value> = cleanRecords
      .iter()
      .filter_map(|record| {
        if let Some(id) = record.get("id").and_then(|id| id.as_str()) {
          Some((id.to_string(), record))
        } else {
          None
        }
      })
      .collect();

    for existingRecord in existingRecords.iter_mut() {
      if let Some(existingId) = existingRecord.get("id").and_then(|id| id.as_str()) {
        if let Some(newRecord) = newRecordsMap.get(existingId) {
          if let (Some(existingObj), Some(newObj)) =
            (existingRecord.as_object_mut(), newRecord.as_object())
          {
            let skip_keys = Self::relationKeysToSkip(nameTable);
            for (key, value) in newObj {
              if key != "_id" && !skip_keys.contains(&key.as_str()) {
                existingObj.insert(key.clone(), value.clone());
              }
            }
          }
        }
      }
    }

    let existingIds: Vec<String> = existingRecords
      .iter()
      .filter_map(|record| {
        record
          .get("id")
          .and_then(|id| id.as_str())
          .map(|s| s.to_string())
      })
      .collect();

    // Use cleanRecords instead of original records
    for newRecord in cleanRecords {
      if let Some(newId) = newRecord.get("id").and_then(|id| id.as_str()) {
        if !existingIds.contains(&newId.to_string()) {
          existingRecords.push(newRecord);
        }
      }
    }

    self.saveDataTable(nameTable, &existingRecords).await?;
    Ok(true)
  }

  pub async fn hardDelete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    let _lock = self.getTableLock(nameTable).lock_owned().await;
    let mut listRecords = self.getDataTable(nameTable).await?;

    let initialLen = listRecords.len();
    listRecords.retain(|record| {
      record
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s != id)
        .unwrap_or(true)
    });

    if listRecords.len() < initialLen {
      self.saveDataTable(nameTable, &listRecords).await?;
      Ok(true)
    } else {
      Err(format!("Record with id {} not found", id).into())
    }
  }

  /// Hard-delete a comment that is stored inline inside a task or subtask record.
  ///
  /// Comments in JSON storage are embedded in the `comments` array of their parent
  /// task or subtask — there is no top-level `comments.json`.  This method scans
  /// both `tasks.json` and `subtasks.json` and removes the matching comment entry.
  pub async fn hardDeleteInlineComment(&self, comment_id: &str) -> ApiResult<bool> {
    let mut found = false;

    for parent_table in &["tasks", "subtasks"] {
      let _lock = self.getTableLock(parent_table).lock_owned().await;
      let mut records = self.getDataTable(parent_table).await?;
      let mut changed = false;

      for record in records.iter_mut() {
        if let Some(comments) = record.get_mut("comments").and_then(|v| v.as_array_mut()) {
          let before = comments.len();
          comments.retain(|c| {
            c.get("id")
              .and_then(|v| v.as_str())
              .map(|s| s != comment_id)
              .unwrap_or(true)
          });
          if comments.len() < before {
            changed = true;
            found = true;
          }
        }
      }

      if changed {
        self.saveDataTable(parent_table, &records).await?;
      }
    }

    if found {
      Ok(true)
    } else {
      // Not an error — comment may already be gone (e.g. parent task was hard-deleted first)
      Ok(false)
    }
  }

  /// Get all records including deleted ones (no automatic isDeleted filter)
  pub async fn getAllWithDeleted(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> ApiResult<Vec<Value>> {
    let listRecords = self.getDataTable(nameTable).await?;
    let effectiveFilter = filter.unwrap_or_else(|| json!({}));
    // When a record is missing a filter key, include it (permissive match for archive queries)
    Ok(Self::apply_filter(&listRecords, &effectiveFilter, true))
  }

  /// Apply a filter object to a slice of records, returning only matching records.
  /// Supports: exact match, `$in` operator, array containment.
  ///
  /// `include_on_missing_key`: when true, records that lack a filtered key are included
  /// (used by `getAllWithDeleted`); when false they are excluded (used by `getAll`).
  fn apply_filter(records: &[Value], filter: &Value, include_on_missing_key: bool) -> Vec<Value> {
    let Some(filterObj) = filter.as_object() else {
      return records.to_vec();
    };

    if filterObj.is_empty() {
      return records.to_vec();
    }

    records
      .iter()
      .filter(|record| {
        let Some(recordObj) = record.as_object() else {
          return false;
        };
        filterObj.iter().all(|(key, filterValue)| {
          if !recordObj.contains_key(key) {
            return include_on_missing_key;
          }
          recordObj
            .get(key)
            .map(|recordValue| {
              if let Some(filterObj) = filterValue.as_object() {
                if let Some(inVals) = filterObj.get("$in").and_then(|v| v.as_array()) {
                  if let Some(vecRec) = recordValue.as_array() {
                    inVals.iter().any(|inVal| vecRec.contains(inVal))
                  } else if let Some(recStr) = recordValue.as_str() {
                    inVals.iter().any(|inVal| inVal.as_str() == Some(recStr))
                  } else {
                    false
                  }
                } else {
                  false
                }
              } else if let Some(arr) = filterValue.as_array() {
                arr.contains(recordValue)
              } else {
                match (recordValue.as_str(), filterValue.as_str()) {
                  (Some(recStr), Some(filterStr)) => recStr == filterStr,
                  _ => recordValue == filterValue,
                }
              }
            })
            .unwrap_or(false)
        })
      })
      .cloned()
      .collect()
  }
}

#[async_trait]
impl CrudProvider for JsonCrudProvider {
  async fn getAll(&self, nameTable: &str, filter: Option<Value>) -> ApiResult<Vec<Value>> {
    let listRecords = self.getDataTable(nameTable).await?;

    let mut effectiveFilter = filter.unwrap_or_else(|| json!({}));

    // Prepend isDeleted: false for tables that support soft delete
    if let Some(filterObj) = effectiveFilter.as_object_mut() {
      if !filterObj.contains_key("isDeleted") && supportsSoftDelete(nameTable) {
        filterObj.insert("isDeleted".to_string(), json!(false));
      }
    }

    Ok(Self::apply_filter(&listRecords, &effectiveFilter, false))
  }

  async fn get(&self, nameTable: &str, id: &str) -> ApiResult<Value> {
    let listRecords = self.getDataTable(nameTable).await?;

    let record = listRecords.into_iter().find(|record| {
      record
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s == id)
        .unwrap_or(false)
    });

    let result = record.ok_or_else(|| format!("Record with id {} not found", id))?;

    Ok(result)
  }

  async fn create(&self, nameTable: &str, data: Value) -> ApiResult<Value> {
    let _lock = self.getTableLock(nameTable).lock_owned().await;
    let mut listRecords = self.getDataTable(nameTable).await?;

    let data_with_defaults = ensureRequiredFields(nameTable, data);

    let cleanData = Self::stripNestedRelations(nameTable, data_with_defaults);

    let created_record = cleanData.clone();

    listRecords.push(cleanData);
    self.saveDataTable(nameTable, &listRecords).await?;

    // For todos, resolve category IDs to full Category objects before returning
    if nameTable == "todos" {
      let resolved = self.resolveTodoCategories(created_record).await;
      Ok(resolved)
    } else {
      Ok(created_record)
    }
  }

  async fn update(&self, nameTable: &str, id: &str, updates: Value) -> ApiResult<Value> {
    let _lock = self.getTableLock(nameTable).lock_owned().await;
    let mut listRecords = self.getDataTable(nameTable).await?;

    let record = listRecords.iter_mut().find(|record| {
      record
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s == id)
        .unwrap_or(false)
    });

    if let Some(record) = record {
      if let (Some(recordObj), Some(updatesObj)) = (record.as_object_mut(), updates.as_object()) {
        let skip_keys = Self::relationKeysToSkip(nameTable);
        for (key, value) in updatesObj {
          if skip_keys.contains(&key.as_str()) {
            continue;
          }
          recordObj.insert(key.clone(), value.clone());
        }
        // Always stamp updatedAt so change-detection and activity logs stay accurate
        if !updatesObj.contains_key("updatedAt") {
          let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
          recordObj.insert("updatedAt".to_string(), Value::String(timestamp));
        }
      }

      let updated_record = record.clone();
      self.saveDataTable(nameTable, &listRecords).await?;

      // For todos, resolve category IDs to full Category objects before returning
      if nameTable == "todos" {
        let resolved = self.resolveTodoCategories(updated_record).await;
        Ok(resolved)
      } else {
        Ok(updated_record)
      }
    } else {
      Err(format!("Record with id {} not found", id).into())
    }
  }

  async fn delete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    let _lock = self.getTableLock(nameTable).lock_owned().await;
    let mut listRecords = self.getDataTable(nameTable).await?;
    let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();

    for record in listRecords.iter_mut() {
      if record.get("id").and_then(|v| v.as_str()) == Some(id) {
        if let Some(obj) = record.as_object_mut() {
          obj.insert("isDeleted".to_string(), Value::Bool(true));
          obj.insert("updatedAt".to_string(), Value::String(timestamp));
          self.saveDataTable(nameTable, &listRecords).await?;
          return Ok(true);
        }
      }
    }

    Err(format!("Record with id {} not found", id).into())
  }
}
