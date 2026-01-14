/* sys lib */
use mongodb::bson::{to_bson, Bson, Document};
use serde_json::{from_str, json, to_string_pretty, to_value, Value};
use std::{
  fs,
  path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

/* helpers */
use super::mongodb_provider::MongodbProvider;

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct JsonProvider {
  pub dbFilePath: PathBuf,
  pub mongodbProvider: Option<std::sync::Arc<MongodbProvider>>,
}

impl JsonProvider {
  #[allow(non_snake_case)]
  pub fn new(
    appHandle: AppHandle,
    envHomeFolder: String,
    envDbName: String,
    mongodbProvider: Option<std::sync::Arc<MongodbProvider>>,
  ) -> Self {
    let homeAppFolder = envHomeFolder;
    let dbName = envDbName;

    let documentFolder = appHandle
      .path()
      .document_dir()
      .expect("Could not find documents directory");

    let appFolder = documentFolder.join(homeAppFolder.clone());
    if !Path::new(&appFolder).exists() {
      let _ = std::fs::create_dir_all(&appFolder);
    }

    let dbFilePath = appFolder.join(&dbName);

    std::fs::create_dir_all(&dbFilePath).expect("Failed to create folder for database");

    Self {
      dbFilePath,
      mongodbProvider,
    }
  }

  #[allow(non_snake_case)]
  fn getTablePath(&self, nameTable: &str) -> PathBuf {
    let mut path = self.dbFilePath.clone();
    path.push(format!("{}.json", nameTable));
    path
  }

  #[allow(non_snake_case)]
  fn convertDocToValue(
    &self,
    doc: Document,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    Ok(to_value(doc)?)
  }

  #[allow(non_snake_case)]
  fn convertValueToDoc(
    &self,
    value: &Value,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    let bson_value = to_bson(value)?;
    if let Bson::Document(doc) = bson_value {
      Ok(doc)
    } else {
      Err(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "Expected Document",
      )))
    }
  }

  #[allow(non_snake_case)]
  fn shouldUseMongo(&self, _nameTable: &str) -> bool {
    // (nameTable == "users" || nameTable == "profiles") && self.mongodbProvider.is_some()
    false
  }

  #[allow(non_snake_case)]
  async fn getByFieldJsonOrMongo(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    id: &str,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    if self.shouldUseMongo(nameTable) {
      let mongoProvider = self.mongodbProvider.as_ref().unwrap();
      let mongoFilter = filter.as_ref().and_then(|f| self.convertValueToDoc(f).ok());
      let doc = mongoProvider
        .get(nameTable, mongoFilter, relations, id)
        .await?;
      self.convertDocToValue(doc)
    } else {
      self.get(nameTable, filter, relations, id).await
    }
  }

  #[allow(non_snake_case)]
  async fn getAllJsonOrMongo(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    if self.shouldUseMongo(nameTable) {
      let mongoProvider = self.mongodbProvider.as_ref().unwrap();
      let mongoFilter = filter.as_ref().and_then(|f| self.convertValueToDoc(f).ok());
      let docs = mongoProvider
        .getAll(nameTable, mongoFilter, relations)
        .await?;
      docs
        .into_iter()
        .map(|doc| self.convertDocToValue(doc))
        .collect::<Result<Vec<_>, _>>()
    } else {
      self.getAll(nameTable, filter, relations).await
    }
  }

  #[allow(non_snake_case)]
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

  #[allow(non_snake_case)]
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

  #[allow(non_snake_case)]
  pub async fn getDataRelations(
    &self,
    mut record: Value,
    relations: Vec<RelationObj>,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(recordObj) = record.as_object_mut() {
      for relation in relations {
        match relation.typeField {
          TypesField::OneToOne => {
            if let Some(value) = recordObj.get(&relation.nameField).cloned() {
              if let Some(idStr) = value.as_str() {
                let result = match self
                  .getByFieldJsonOrMongo(&relation.nameTable, None, relation.relations, idStr)
                  .await
                {
                  Ok(doc) => doc,
                  Err(_) => continue,
                };
                recordObj.insert(relation.newNameField.clone(), result);
              }
            }
          }
          TypesField::OneToMany => {
            if let Some(idValue) = recordObj.get("id").cloned() {
              if let Some(idStr) = idValue.as_str() {
                let filter = json!({ relation.nameField: idStr });
                let result = match self
                  .getAllJsonOrMongo(&relation.nameTable, Some(filter), relation.relations)
                  .await
                {
                  Ok(records) => Value::Array(records),
                  Err(_) => continue,
                };
                recordObj.insert(relation.newNameField.clone(), result);
              }
            }
          }
          TypesField::ManyToOne => {
            if let Some(arrayValue) = recordObj.get(&relation.nameField).cloned() {
              if let Some(ids) = arrayValue.as_array() {
                let mut listResult: Vec<Value> = vec![];
                for id in ids {
                  if let Some(idStr) = id.as_str() {
                    let result = match self
                      .getByFieldJsonOrMongo(
                        &relation.nameTable,
                        None,
                        relation.relations.clone(),
                        idStr,
                      )
                      .await
                    {
                      Ok(doc) => doc,
                      Err(_) => continue,
                    };
                    listResult.push(result);
                  }
                }
                recordObj.insert(relation.newNameField.clone(), Value::Array(listResult));
              }
            }
          }
          TypesField::ManyToMany => {
            if let Some(idValue) = recordObj.get("id").cloned() {
              if let Some(idStr) = idValue.as_str() {
                let allRecords = match self
                  .getAllJsonOrMongo(&relation.nameTable, None, relation.relations.clone())
                  .await
                {
                  Ok(records) => records,
                  Err(_) => continue,
                };
                let filteredRecords: Vec<Value> = allRecords
                  .into_iter()
                  .filter(|record| {
                    if let Some(fieldValue) = record.get(&relation.nameField) {
                      if let Some(arr) = fieldValue.as_array() {
                        arr.iter().any(|v| v.as_str() == Some(idStr))
                      } else {
                        false
                      }
                    } else {
                      false
                    }
                  })
                  .collect();
                recordObj.insert(relation.newNameField.clone(), Value::Array(filteredRecords));
              }
            }
          }
        }
      }
    }

    Ok(record)
  }

  #[allow(non_snake_case)]
  pub async fn getAll(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
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
                          inVals.iter().any(|in_val| vecRec.contains(in_val))
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

    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in listRecords {
        let enriched = Box::pin(self.getDataRelations(result, relations.clone())).await?;
        enrichedResults.push(enriched);
      }
      listRecords = enrichedResults;
    }

    Ok(listRecords)
  }

  #[allow(non_snake_case)]
  pub async fn get(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
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
                  if let Some(filter_obj) = filterValue.as_object() {
                    if let Some(in_vals) = filter_obj.get("$in").and_then(|v| v.as_array()) {
                      if let Some(rec_arr) = recordValue.as_array() {
                        in_vals.iter().any(|in_val| rec_arr.contains(in_val))
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

    let mut result = record.ok_or_else(|| {
      Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Record not found",
      ))
    })?;

    if let Some(relations) = relations {
      result = Box::pin(self.getDataRelations(result, relations)).await?;
    }

    Ok(result)
  }

  #[allow(non_snake_case)]
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

  #[allow(non_snake_case)]
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

  #[allow(non_snake_case)]
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

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.getDataTable(nameTable).await?;

    for record in listRecords.iter_mut() {
      if record.get("id").and_then(|v| v.as_str()) == Some(id) {
        if let Some(obj) = record.as_object_mut() {
          obj.insert("isDeleted".to_string(), Value::Bool(true));
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

  #[allow(non_snake_case)]
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
}
