/* sys lib */
use dotenv::dotenv;
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
  env, fs,
  path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

/* models */
use crate::models::relation_obj_models::{RelationObj, TypesField};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct JsonProvider {
  pub dbFilePath: PathBuf,
}

impl JsonProvider {
  #[allow(non_snake_case)]
  pub fn new(appHandle: AppHandle) -> Self {
    dotenv().ok();

    let homeAppFolder = env::var("HOME_APP_FOLDER").expect("HOME_APP_FOLDER must be set in .env");
    let dbName = env::var("JSON_DB_NAME").expect("JSON_DB_NAME must be set in .env");

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
      dbFilePath: dbFilePath,
    }
  }

  #[allow(non_snake_case)]
  fn getTablePath(&self, nameTable: &str) -> PathBuf {
    let mut path = self.dbFilePath.clone();
    path.push(format!("{}.json", nameTable));
    path
  }

  #[allow(non_snake_case)]
  pub async fn getDataTable(
    &self,
    nameTable: &str,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let tablePath = self.getTablePath(nameTable);

    if !tablePath.exists() {
      fs::write(&tablePath, "[]")?;
      return Ok(Vec::new());
    }

    let content = fs::read_to_string(&tablePath)?;
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
    fs::write(&tablePath, jsonString)?;

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
                  .getByField(&relation.nameTable, None, relation.relations, idStr)
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
                  .getAllByField(&relation.nameTable, Some(filter), relation.relations)
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
                      .getByField(&relation.nameTable, None, relation.relations.clone(), idStr)
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
          TypesField::ManyToMany => {}
        }
      }
    }

    Ok(record)
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.getDataTable(nameTable).await?;

    if let Some(filter) = filter {
      if let Some(filterObj) = filter.as_object() {
        listRecords = listRecords
          .into_iter()
          .filter(|record| {
            if let Some(recordObj) = record.as_object() {
              filterObj.iter().all(|(key, filterValue)| {
                recordObj
                  .get(key)
                  .map(|recordValue| recordValue == filterValue)
                  .unwrap_or(false)
              })
            } else {
              false
            }
          })
          .collect();
      }
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
  pub async fn getByField(
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
                .map(|recordValue| recordValue == filterValue)
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
  pub async fn delete(
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

  #[allow(non_snake_case)]
  pub async fn tableExists(&self, nameTable: &str) -> bool {
    self.getTablePath(nameTable).exists()
  }

  #[allow(non_snake_case)]
  pub async fn createTable(
    &self,
    nameTable: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tablePath = self.getTablePath(nameTable);
    if !tablePath.exists() {
      fs::write(&tablePath, "[]")?;
      Ok(true)
    } else {
      Ok(false)
    }
  }

  #[allow(non_snake_case)]
  pub async fn dropTable(
    &self,
    nameTable: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tablePath = self.getTablePath(nameTable);
    if tablePath.exists() {
      fs::remove_file(&tablePath)?;
      Ok(true)
    } else {
      Ok(false)
    }
  }

  #[allow(non_snake_case)]
  pub async fn count(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let data = self.getAllByField(nameTable, filter, None).await?;

    Ok(data.len())
  }
}
