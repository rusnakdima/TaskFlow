/* sys lib */
use async_trait::async_trait;
use mongodb::{
  bson::{doc, from_bson, to_bson, Document},
  Collection, Database,
};
use serde_json::Value;

/* providers */
use crate::errors::ApiResult;
use crate::providers::base_crud::CrudProvider;

/// MongodbCrudProvider - CRUD operations for MongoDB
#[derive(Clone)]
pub struct MongodbCrudProvider {
  pub db: Database,
}

impl MongodbCrudProvider {
  pub fn new(db: Database) -> Self {
    Self { db }
  }

  pub async fn getDataTable(&self, nameTable: &str) -> ApiResult<Collection<Document>> {
    let tableData = self.db.collection::<Document>(nameTable);
    Ok(tableData)
  }

  pub async fn getAllWithDeleted(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> ApiResult<Vec<Value>> {
    let tableData = self.getDataTable(nameTable).await?;

    let effectiveFilter = match filter {
      Some(f) => match to_bson(&f)? {
        mongodb::bson::Bson::Document(d) => d,
        _ => doc! {},
      },
      None => doc! {},
    };

    let mut cursor = tableData.find(effectiveFilter).await?;

    let mut results: Vec<Value> = Vec::new();
    while cursor.advance().await? {
      let doc = cursor.deserialize_current()?;
      let val = from_bson(mongodb::bson::Bson::Document(doc))?;
      results.push(val);
    }

    Ok(results)
  }

  pub async fn updateAll(&self, nameTable: &str, records: Vec<Value>) -> ApiResult<bool> {
    if records.is_empty() {
      return Ok(true);
    }

    let tableData = self.getDataTable(nameTable).await?;

    for rec in records {
      let mut doc: Document = match to_bson(&rec)? {
        mongodb::bson::Bson::Document(d) => d,
        _ => continue,
      };

      let id = doc.get_str("id").unwrap_or_default();
      if id.is_empty() {
        continue;
      }

      let filter = doc! { "id": id };

      doc.remove("_id");

      let update = doc! { "$set": doc };
      let options = mongodb::options::UpdateOptions::builder()
        .upsert(true)
        .build();

      tableData
        .update_one(filter, update)
        .with_options(options)
        .await?;
    }

    Ok(true)
  }

  pub async fn hardDelete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };
    tableData.delete_one(filter).await?;
    Ok(true)
  }
}

#[async_trait]
impl CrudProvider for MongodbCrudProvider {
  async fn getAll(&self, nameTable: &str, filter: Option<Value>) -> ApiResult<Vec<Value>> {
    let tableData = self.getDataTable(nameTable).await?;

    let mut effectiveFilter = match filter {
      Some(f) => match to_bson(&f)? {
        mongodb::bson::Bson::Document(d) => d,
        _ => doc! {},
      },
      None => doc! {},
    };

    // Skip isDeleted filter for tables that don't support soft delete (e.g., users)
    if !effectiveFilter.contains_key("isDeleted") && nameTable != "users" {
      effectiveFilter.insert("isDeleted", false);
    }

    let mut cursor = tableData.find(effectiveFilter).await?;

    let mut results: Vec<Value> = Vec::new();
    while cursor.advance().await? {
      let doc = cursor.deserialize_current()?;
      let val = from_bson(mongodb::bson::Bson::Document(doc))?;
      results.push(val);
    }

    Ok(results)
  }

  async fn get(&self, nameTable: &str, id: &str) -> ApiResult<Value> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };

    let doc = tableData
      .find_one(filter)
      .await?
      .ok_or_else(|| format!("Document with id {} not found", id))?;

    let val = from_bson(mongodb::bson::Bson::Document(doc))?;
    Ok(val)
  }

  async fn create(&self, nameTable: &str, data: Value) -> ApiResult<bool> {
    let tableData = self.getDataTable(nameTable).await?;
    let doc: Document = match to_bson(&data)? {
      mongodb::bson::Bson::Document(d) => d,
      _ => return Err("Invalid data format for MongoDB".into()),
    };
    tableData.insert_one(doc).await?;
    Ok(true)
  }

  async fn update(&self, nameTable: &str, id: &str, data: Value) -> ApiResult<bool> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };

    let mut doc: Document = match to_bson(&data)? {
      mongodb::bson::Bson::Document(d) => d,
      _ => return Err("Invalid data format for MongoDB".into()),
    };
    doc.remove("_id"); // Never update _id

    let update = doc! { "$set": doc };
    tableData.update_one(filter, update).await?;
    Ok(true)
  }

  async fn delete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };
    let update = doc! { "$set": { "isDeleted": true, "updatedAt": timestamp } };
    tableData.update_one(filter, update).await?;
    Ok(true)
  }
}
