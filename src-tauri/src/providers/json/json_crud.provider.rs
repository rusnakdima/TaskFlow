/* sys lib */
use async_trait::async_trait;
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{fs, path::PathBuf};

/* providers */
use crate::errors::ApiResult;
use crate::providers::base_crud::CrudProvider;

/* helpers */
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
  /// This ensures tasks/subtasks/comments are stored in their own tables, not nested in parent records
  fn stripNestedRelations(table: &str, mut data: Value) -> Value {
    if let Some(obj) = data.as_object_mut() {
      match table {
        // Todo records should not contain nested tasks or subtasks
        "todos" => {
          obj.remove("tasks");
          obj.remove("subtasks");
        }
        // Task records should not contain nested subtasks or comments
        "tasks" => {
          obj.remove("subtasks");
          obj.remove("comments");
        }
        // Subtask records should not contain nested comments
        "subtasks" => {
          obj.remove("comments");
        }
        _ => {}
      }
    }
    data
  }

  /// Table name mapping for file storage (keeps plural names)
  fn getTableName(nameTable: &str) -> String {
    nameTable.to_string()
  }

  fn getTablePath(&self, nameTable: &str) -> PathBuf {
    let mut path = self.dbFilePath.clone();
    let tableName = Self::getTableName(nameTable);
    path.push(format!("{}.json", tableName));
    path
  }

  pub async fn getDataTable(&self, nameTable: &str) -> ApiResult<Vec<Value>> {
    let tablePath = self.getTablePath(nameTable);

    if let Some(parentDir) = tablePath.parent() {
      fs::create_dir_all(parentDir).map_err(|e| e.to_string())?;
    }

    if !tablePath.exists() {
      fs::write(&tablePath, "[]").map_err(|e| e.to_string())?;
      return Ok(Vec::new());
    }

    let content = fs::read_to_string(&tablePath).map_err(|e| e.to_string())?;

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
      if let Err(e) = fs::create_dir_all(parent) {
        return Err(format!("Failed to create directory: {}", e).into());
      }
    }

    let jsonString = to_string_pretty(data)?;

    let tempPath = tablePath.with_extension("tmp");

    if let Err(e) = fs::write(&tempPath, &jsonString) {
      let _ = fs::remove_file(&tempPath);
      return Err(format!("Failed to write temp file: {}", e).into());
    }

    if let Err(e) = fs::rename(&tempPath, &tablePath) {
      let _ = fs::remove_file(&tempPath);
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
    let mut listRecords = self.getDataTable(nameTable).await?;

    let effectiveFilter = if let Some(f) = filter { f } else { json!({}) };

    if let Some(filterObj) = effectiveFilter.as_object() {
      listRecords = listRecords
        .into_iter()
        .filter(|record| {
          if let Some(recordObj) = record.as_object() {
            filterObj.iter().all(|(key, filterValue)| {
              if recordObj.contains_key(key) {
                recordObj
                  .get(key)
                  .map(|recordValue| {
                    if let Some(filterValue) = filterValue.as_object() {
                      if let Some(inVals) = filterValue.get("$in").and_then(|v| v.as_array()) {
                        if let Some(vecRec) = recordValue.as_array() {
                          inVals.iter().any(|inVal| vecRec.contains(inVal))
                        } else {
                          false
                        }
                      } else {
                        false
                      }
                    } else if filterValue.is_array() {
                      filterValue.as_array().unwrap().contains(recordValue)
                    } else {
                      // Compare string values properly
                      match (recordValue.as_str(), filterValue.as_str()) {
                        (Some(recStr), Some(filterStr)) => recStr == filterStr,
                        _ => recordValue == filterValue,
                      }
                    }
                  })
                  .unwrap_or(false)
              } else {
                true
              }
            })
          } else {
            false
          }
        })
        .collect();
    }

    Ok(listRecords)
  }
}

#[async_trait]
impl CrudProvider for JsonCrudProvider {
  async fn getAll(&self, nameTable: &str, filter: Option<Value>) -> ApiResult<Vec<Value>> {
    let mut listRecords = self.getDataTable(nameTable).await?;

    let mut effectiveFilter = if let Some(f) = filter { f } else { json!({}) };

    // Skip isDeleted filter for tables that don't support soft delete (e.g., users, profiles, comments)
    if let Some(filterObj) = effectiveFilter.as_object_mut() {
      if !filterObj.contains_key("isDeleted")
        && nameTable != "users"
        && nameTable != "profiles"
        && nameTable != "comments"
      {
        filterObj.insert("isDeleted".to_string(), json!(false));
      }
    }

    if let Some(filterObj) = effectiveFilter.as_object() {
      listRecords = listRecords
        .into_iter()
        .filter(|record| {
          if let Some(recordObj) = record.as_object() {
            filterObj.iter().all(|(key, filterValue)| {
              // If record doesn't have the key, it should NOT match (return false)
              if !recordObj.contains_key(key) {
                return false;
              }

              recordObj
                .get(key)
                .map(|recordValue| {
                  if let Some(filterValue) = filterValue.as_object() {
                    if let Some(inVals) = filterValue.get("$in").and_then(|v| v.as_array()) {
                      if let Some(vecRec) = recordValue.as_array() {
                        inVals.iter().any(|inVal| vecRec.contains(inVal))
                      } else {
                        false
                      }
                    } else {
                      false
                    }
                  } else if filterValue.is_array() {
                    filterValue.as_array().unwrap().contains(recordValue)
                  } else {
                    // Compare string values properly
                    match (recordValue.as_str(), filterValue.as_str()) {
                      (Some(recStr), Some(filterStr)) => recStr == filterStr,
                      _ => recordValue == filterValue,
                    }
                  }
                })
                .unwrap_or(false)
            })
          } else {
            false
          }
        })
        .collect();
    }

    Ok(listRecords)
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
    println!("[JsonCrudProvider] create in table: {}", nameTable);
    let mut listRecords = self.getDataTable(nameTable).await?;

    // Ensure all required fields are present before saving
    let data_with_defaults = ensure_required_fields(nameTable, data);

    // Strip nested relations before saving
    let cleanData = Self::stripNestedRelations(nameTable, data_with_defaults);
    
    // Get the created record before pushing
    let created_record = cleanData.clone();
    
    listRecords.push(cleanData);
    self.saveDataTable(nameTable, &listRecords).await?;
    println!("[JsonCrudProvider] create successful, record saved to file");

    // ✅ Return the created record
    Ok(created_record)
  }

  async fn update(&self, nameTable: &str, id: &str, updates: Value) -> ApiResult<Value> {
    println!("[JsonCrudProvider] update in table: {}, id: {}", nameTable, id);
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
          // Skip nested relation fields during update
          if key == "tasks" || key == "subtasks" || key == "comments" {
            continue;
          }
          recordObj.insert(key.clone(), value.clone());
        }
      }

      // Clone the updated record BEFORE passing listRecords to saveDataTable
      let updated_record = record.clone();
      self.saveDataTable(nameTable, &listRecords).await?;
      println!("[JsonCrudProvider] update successful, record saved to file");
      // ✅ Return the updated record
      Ok(updated_record)
    } else {
      println!("[JsonCrudProvider] update failed: record not found");
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
