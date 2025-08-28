/* sys lib */
use dotenv::dotenv;
use serde_json::{from_slice, Value};
use serde_json::{json, Map};
use sled::{Db, Tree};
use std::env;
use tauri::AppHandle;
use tauri::Manager;

/* models */
use crate::models::relation_obj_models::{RelationObj, TypesField};

#[derive(Clone)]
pub struct SledProvider {
  pub db: Db,
}

impl SledProvider {
  #[allow(non_snake_case)]
  pub fn new(appHandle: AppHandle) -> Self {
    dotenv().ok();

    let mut basePath = appHandle
      .path()
      .document_dir()
      .expect("Failed to get document directory");

    let appName = env::var("HOME_APP_FOLDER").expect("HOME_APP_FOLDER must be set in .env");
    basePath.push(appName);

    let dbSubpath = env::var("SLED_DB_NAME").expect("SLED_DB_NAME must be set in .env");
    let dbPath = basePath.join(dbSubpath);

    std::fs::create_dir_all(&dbPath.parent().unwrap_or(&dbPath))
      .expect("Failed to create database directory");

    Self {
      db: sled::open(&dbPath).expect("Failed to open database"),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getTableData(
    &self,
    nameTable: &str,
  ) -> Result<Tree, Box<dyn std::error::Error + Send + Sync>> {
    println!("{:?}", self.db);
    let tree = self.db.open_tree(nameTable)?;
    Ok(tree)
  }

  #[allow(non_snake_case)]
  pub async fn getDataRelations(
    &self,
    mut record: Value,
    relations: Vec<RelationObj>,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut recordObj = record
      .as_object()
      .ok_or("Record must be a JSON object")?
      .clone();

    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne => {
          if let Some(value) = recordObj.get(&relation.nameField).cloned() {
            let result = match self
              .getByField(
                &relation.nameTable,
                None,
                relation.relations,
                value.as_str().ok_or("Value must be a string")?,
              )
              .await
            {
              Ok(doc) => doc,
              Err(_) => continue,
            };
            recordObj.insert(relation.newNameField.clone(), result);
          }
        }
        TypesField::OneToMany => {
          if let Some(value) = recordObj.get("id").cloned() {
            let filter = Some(
              serde_json::json!({ relation.nameField: value.as_str().ok_or("Value must be a string")? }),
            );
            let result = match self
              .getAllByField(&relation.nameTable, filter, relation.relations)
              .await
            {
              Ok(doc) => doc,
              Err(_) => continue,
            };
            recordObj.insert(relation.newNameField.clone(), Value::Array(result));
          }
        }
        TypesField::ManyToOne => {
          if let Some(values) = recordObj
            .get(&relation.nameField)
            .and_then(|v| v.as_array())
          {
            let mut listResult: Vec<Value> = vec![];
            for id in values {
              let result = match self
                .getByField(
                  &relation.nameTable,
                  None,
                  relation.relations.clone(),
                  id.as_str().ok_or("Value must be a string")?,
                )
                .await
              {
                Ok(doc) => doc,
                Err(_) => continue,
              };
              listResult.push(result);
            }
            recordObj.insert(relation.newNameField.clone(), Value::Array(listResult));
          }
        }
        TypesField::ManyToMany => {}
      }
    }

    Ok(Value::Object(recordObj))
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getTableData(nameTable).await?;
    let filterObj = filter;
    // .map(|f| match f {
    //   Value::Object(map) => Ok(map),
    //   _ => Err("Filter must be a JSON object"),
    // })
    // .transpose()?;

    let mut results: Vec<Value> = Vec::new();
    // for entry in tableData.iter() {
    //   let (_k, v) = entry?;
    //   let record: Value = from_slice(&v)?;
    //   if let Some(filter) = &filterObj {
    //     let recordObj = record.as_object().ok_or("Document must be a JSON object")?;
    //     let mut matches = true;
    //     for (key, val) in filter {
    //       if recordObj.get(key) != Some(val) {
    //         matches = false;
    //         break;
    //       }
    //     }
    //     if !matches {
    //       continue;
    //     }
    //   }
    //   results.push(record);
    // }

    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in results {
        let enriched = Box::pin(self.getDataRelations(result, relations.clone())).await?;
        enrichedResults.push(enriched);
      }
      results = enrichedResults;
    }

    Ok(results)
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    id: &str,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getTableData(nameTable).await?;
    let filter = match filter {
      Some(f) => filter
        .map(|f| match f {
          Value::Object(map) => Ok(map),
          _ => Err("Filter must be a JSON object"),
        })
        .transpose()?,
      None => json!({ "id": id }),
    };

    println!("{:?}", filter.get("id").is_some());

    // if filter.get("id").is_some() && filter.as_object().map(|o| o.len() == 1).unwrap_or(false) {
    //   if let Some(v) = tableData.get(id.as_bytes())? {
    //     let mut record: Value = from_slice(&v)?;
    //     if let Some(relations) = relations {
    //       record = Box::pin(self.getDataRelations(record, relations)).await?;
    //     }
    //     return Ok(record);
    //   } else {
    //     return Err(Box::new(std::io::Error::new(
    //       std::io::ErrorKind::NotFound,
    //       "Record not found",
    //     )));
    //   }
    // }

    let filterObj = filter.as_object().ok_or("Filter must be a JSON object")?;
    println!("{:?}", tableData);
    println!("{:?}", filterObj);
    for entry in tableData.iter() {
      let (_k, v) = entry?;
      let record: Value = from_slice(&v)?;
      let recordObj = record.as_object().ok_or("Record must be a JSON object")?;
      let mut matches = true;
      for (key, val) in filterObj {
        if recordObj.get(key) != Some(val) {
          matches = false;
          break;
        }
      }
      if matches {
        let enrichedResult = if let Some(relations) = relations {
          Box::pin(self.getDataRelations(record, relations)).await?
        } else {
          record
        };
        return Ok(enrichedResult);
      }
    }

    Err(Box::new(std::io::Error::new(
      std::io::ErrorKind::NotFound,
      "Record not found",
    )))
  }

  #[allow(non_snake_case)]
  pub async fn create(
    &self,
    nameTable: &str,
    data: Value,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getTableData(nameTable).await?;
    let id = data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or("Missing or invalid id field")?;
    let value = serde_json::to_vec(&data)?;
    tableData.insert(id.as_bytes(), value)?;

    Ok(true)
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    nameTable: &str,
    id: &str,
    data: Value,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getTableData(nameTable).await?;
    if let Some(v) = tableData.get(id.as_bytes())? {
      let mut existing: Value = serde_json::from_slice(&v)?;
      let existingObj = existing
        .as_object_mut()
        .ok_or("Existing document must be a JSON object")?;
      let dataObj = data.as_object().ok_or("Data must be a JSON object")?;
      for (k, v) in dataObj {
        existingObj.insert(k.clone(), v.clone());
      }
      let newValue = serde_json::to_vec(&existing)?;
      tableData.insert(id.as_bytes(), newValue)?;
    }

    Ok(true)
  }

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getTableData(nameTable).await?;
    tableData.remove(id.as_bytes())?;

    Ok(true)
  }
}
