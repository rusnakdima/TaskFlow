/* sys lib */
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/* models */
use crate::models::relation_obj::RelationObj;

/* providers */
use super::{
  json_crud_provider::JsonCrudProvider, json_relations_provider::JsonRelationsProvider,
  json_sync_provider::JsonSyncProvider, mongodb_provider::MongodbProvider,
};

#[derive(Clone)]
pub struct JsonProvider {
  pub jsonCrud: JsonCrudProvider,
  pub jsonSync: JsonSyncProvider,
  pub jsonRelations: JsonRelationsProvider,
}

impl JsonProvider {
  pub fn new(
    appHandle: AppHandle,
    envHomeFolder: String,
    envDbName: String,
    mongodbProvider: Option<Arc<MongodbProvider>>,
  ) -> Self {
    let documentFolder = appHandle
      .path()
      .document_dir()
      .expect("Could not find documents directory");

    let appFolder = documentFolder.join(&envHomeFolder);
    std::fs::create_dir_all(&appFolder).ok();

    let dbFilePath = appFolder.join(&envDbName);
    std::fs::create_dir_all(&dbFilePath).expect("Failed to create folder for database");

    let jsonCrud = JsonCrudProvider::new(dbFilePath.clone());
    let jsonSync = JsonSyncProvider::new(mongodbProvider.clone());
    let jsonRelations = JsonRelationsProvider::new(jsonCrud.clone());

    Self {
      jsonCrud,
      jsonSync,
      jsonRelations,
    }
  }

  // ==================== CRUD OPERATIONS ====================

  pub async fn create(
    &self,
    nameTable: &str,
    data: Value,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    // Special handling for daily_activities uniqueness
    if nameTable == "daily_activities" {
      if let (Some(userId), Some(date)) = (
        data.get("userId").and_then(|v| v.as_str()),
        data.get("date").and_then(|v| v.as_str()),
      ) {
        let filter = serde_json::json!({ "userId": userId, "date": date });
        let existing = self.getAll(nameTable, Some(filter), None).await?;
        if !existing.is_empty() {
          return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "Record already exists",
          )));
        }
      }
    }

    self.jsonCrud.create(nameTable, data).await
  }

  pub async fn update(
    &self,
    nameTable: &str,
    id: &str,
    updates: Value,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.jsonCrud.update(nameTable, id, updates).await
  }

  pub async fn updateAll(
    &self,
    nameTable: &str,
    records: Vec<Value>,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.jsonCrud.updateAll(nameTable, records).await
  }

  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.jsonCrud.delete(nameTable, id).await
  }

  pub async fn hardDelete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.jsonCrud.hardDelete(nameTable, id).await
  }

  // ==================== READ OPERATIONS ====================

  pub async fn getAll(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.jsonCrud.getAll(nameTable, filter).await?;

    // Apply relations if specified
    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in listRecords {
        let enriched = self
          .jsonRelations
          .getDataRelations(result, relations.clone())
          .await?;
        enrichedResults.push(enriched);
      }
      listRecords = enrichedResults;
    }

    Ok(listRecords)
  }

  /// Get all records including deleted ones (no automatic isDeleted filter)
  pub async fn getAllWithDeleted(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    let mut listRecords = self.jsonCrud.getAllWithDeleted(nameTable, filter).await?;

    // Apply relations if specified
    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in listRecords {
        let enriched = self
          .jsonRelations
          .getDataRelations(result, relations.clone())
          .await?;
        enrichedResults.push(enriched);
      }
      listRecords = enrichedResults;
    }

    Ok(listRecords)
  }

  pub async fn get(
    &self,
    nameTable: &str,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    id: &str,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut result = self.jsonCrud.get(nameTable, filter, id).await?;

    // Apply relations if specified
    if let Some(relations) = relations {
      result = self
        .jsonRelations
        .getDataRelations(result, relations)
        .await?;
    }

    Ok(result)
  }

  // ==================== UTILITY METHODS ====================

  pub async fn getDataTable(
    &self,
    nameTable: &str,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    self.jsonCrud.getDataTable(nameTable).await
  }

  pub async fn saveDataTable(
    &self,
    nameTable: &str,
    data: &Vec<Value>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.jsonCrud.saveDataTable(nameTable, data).await
  }
}
