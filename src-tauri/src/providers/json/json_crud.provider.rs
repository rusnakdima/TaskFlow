/* sys lib */
use async_trait::async_trait;
use serde_json::{from_str, json, to_string_pretty, Value};
use std::path::PathBuf;
use tokio::fs;

/* providers */
use crate::errors::ApiResult;
use crate::providers::base_crud::CrudProvider;

/* helpers */
use crate::helpers::common::supports_soft_delete;
use crate::helpers::model_helper::ensure_required_fields;

/// JsonCrudProvider - CRUD operations for JSON file storage
#[derive(Clone)]
pub struct JsonCrudProvider {
  pub dbFilePath: PathBuf,
}

impl JsonCrudProvider {
  pub fn new(dbFilePath: PathBuf) -> Self {
    Self { dbFilePath }
  }

  /// Strip nested relation fields from data before saving to prevent storing embedded relations
  /// This ensures tasks/subtasks are stored in their own tables, not nested in parent records
  /// Note: comments are stored inline in tasks/subtasks, not stripped
  fn stripNestedRelations(table: &str, mut data: Value) -> Value {
    if let Some(obj) = data.as_object_mut() {
      match table {
        // Todo records should not contain nested tasks or subtasks
        "todos" => {
          obj.remove("tasks");
          obj.remove("subtasks");
        }
        // Task records - keep comments (stored inline), only strip subtasks
        "tasks" => {
          obj.remove("subtasks");
        }
        // Subtask records - keep comments (stored inline)
        "subtasks" => {
          // Don't strip comments - they're stored inline
        }
        _ => {}
      }
    }
    data
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
            for (key, value) in newObj {
              // Skip _id and nested relation fields
              if key != "_id" && key != "tasks" && key != "subtasks" && key != "comments" {
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
      if !filterObj.contains_key("isDeleted") && supports_soft_delete(nameTable) {
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
    let mut listRecords = self.getDataTable(nameTable).await?;

    let data_with_defaults = ensure_required_fields(nameTable, data);

    let cleanData = Self::stripNestedRelations(nameTable, data_with_defaults);

    let created_record = cleanData.clone();

    listRecords.push(cleanData);
    self.saveDataTable(nameTable, &listRecords).await?;

    Ok(created_record)
  }

  async fn update(&self, nameTable: &str, id: &str, updates: Value) -> ApiResult<Value> {
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
        for (key, value) in updatesObj {
          if key == "tasks" || key == "subtasks" || key == "comments" {
            continue;
          }
          recordObj.insert(key.clone(), value.clone());
        }
      }

      let updated_record = record.clone();
      self.saveDataTable(nameTable, &listRecords).await?;
      Ok(updated_record)
    } else {
      Err(format!("Record with id {} not found", id).into())
    }
  }

  async fn delete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
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
