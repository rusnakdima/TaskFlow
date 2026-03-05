/* sys lib */
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{fs, path::PathBuf};

/// JsonCrudProvider - CRUD operations for JSON file storage
#[derive(Clone)]
pub struct JsonCrudProvider {
  pub dbFilePath: PathBuf,
}

impl JsonCrudProvider {
  pub fn new(dbFilePath: PathBuf) -> Self {
    Self { dbFilePath }
  }

  fn getTablePath(&self, nameTable: &str) -> PathBuf {
    let mut path = self.dbFilePath.clone();
    path.push(format!("{}.json", nameTable));
    path
  }

  pub async fn getDataTable(
    &self,
    nameTable: &str,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let tablePath = self.getTablePath(nameTable);

    if let Some(parentDir) = tablePath.parent() {
      fs::create_dir_all(parentDir)?;
    }

    if !tablePath.exists() {
      fs::write(&tablePath, "[]")?;
      return Ok(Vec::new());
    }

    let content = fs::read_to_string(&tablePath)?;

    if content.trim().is_empty() {
      return Ok(vec![]);
    }

    let data: Vec<Value> = from_str::<Vec<Value>>(&content)?;

    Ok(data)
  }

  pub async fn saveDataTable(
    &self,
    nameTable: &str,
    data: &Vec<Value>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let tablePath = self.getTablePath(nameTable);

    let jsonString = to_string_pretty(data)?;

    let tempPath = tablePath.with_extension("tmp");

    if let Err(e) = fs::write(&tempPath, &jsonString) {
      let _ = fs::remove_file(&tempPath);
      return Err(Box::new(e));
    }

    if let Err(e) = fs::rename(&tempPath, &tablePath) {
      let _ = fs::remove_file(&tempPath);
      return Err(Box::new(e));
    }

    Ok(())
  }

  pub async fn create(
    &self,
    nameTable: &str,
    data: Value,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.getDataTable(nameTable).await?;

    listRecords.push(data);
    self.saveDataTable(nameTable, &listRecords).await?;

    Ok(true)
  }

  pub async fn update(
    &self,
    nameTable: &str,
    id: &str,
    updates: Value,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
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
          recordObj.insert(key.clone(), value.clone());
        }
      }

      self.saveDataTable(nameTable, &listRecords).await?;
      Ok(true)
    } else {
      Err(Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Record not found",
      )))
    }
  }

  pub async fn updateAll(
    &self,
    nameTable: &str,
    records: Vec<Value>,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let mut existingRecords = self.getDataTable(nameTable).await?;

    let newRecordsMap: std::collections::HashMap<String, &Value> = records
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
              if key != "_id" {
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

    for newRecord in records {
      if let Some(newId) = newRecord.get("id").and_then(|id| id.as_str()) {
        if !existingIds.contains(&newId.to_string()) {
          existingRecords.push(newRecord);
        }
      }
    }

    self.saveDataTable(nameTable, &existingRecords).await?;
    Ok(true)
  }

  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.getDataTable(nameTable).await?;
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    for record in listRecords.iter_mut() {
      if record.get("id").and_then(|v| v.as_str()) == Some(id) {
        if let Some(obj) = record.as_object_mut() {
          obj.insert("isDeleted".to_string(), Value::Bool(true));
          obj.insert("updatedAt".to_string(), Value::String(formatted));
          self.saveDataTable(nameTable, &listRecords).await?;
          return Ok(true);
        }
      }
    }

    Err(Box::new(std::io::Error::new(
      std::io::ErrorKind::NotFound,
      "Record not found",
    )))
  }

  pub async fn hardDelete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
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
      Err(Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Record not found",
      )))
    }
  }

  pub async fn getAll(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.getDataTable(nameTable).await?;

    let mut effectiveFilter = if let Some(f) = filter { f } else { json!({}) };

    if let Some(filterObj) = effectiveFilter.as_object_mut() {
      if !filterObj.contains_key("isDeleted") {
        filterObj.insert("isDeleted".to_string(), json!(false));
      }
    }

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
                      recordValue == filterValue
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

  pub async fn get(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    id: &str,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let listRecords = self.getDataTable(nameTable).await?;

    let record = if let Some(filter) = filter {
      if let Some(filterObj) = filter.as_object() {
        listRecords.into_iter().find(|record| {
          if let Some(recordObj) = record.as_object() {
            filterObj.iter().all(|(key, filterValue)| {
              recordObj
                .get(key)
                .map(|recordValue| {
                  if let Some(filterObj) = filterValue.as_object() {
                    if let Some(inVals) = filterObj.get("$in").and_then(|v| v.as_array()) {
                      if let Some(recArr) = recordValue.as_array() {
                        inVals.iter().any(|inVal| recArr.contains(inVal))
                      } else {
                        false
                      }
                    } else {
                      false
                    }
                  } else if filterValue.is_array() {
                    filterValue.as_array().unwrap().contains(recordValue)
                  } else {
                    recordValue == filterValue
                  }
                })
                .unwrap_or(false)
            })
          } else {
            false
          }
        })
      } else {
        None
      }
    } else {
      listRecords.into_iter().find(|record| {
        record
          .get("id")
          .and_then(|v| v.as_str())
          .map(|s| s == id)
          .unwrap_or(false)
      })
    };

    let result = record.ok_or_else(|| {
      Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Record not found",
      ))
    })?;

    Ok(result)
  }
}
