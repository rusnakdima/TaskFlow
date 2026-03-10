/* sys lib */
use serde_json::{json, Value};
use std::collections::HashSet;

/* providers */
use super::{json_provider::JsonProvider, mongodb_crud_provider::MongodbCrudProvider};
use crate::providers::base_crud::CrudProvider;

/* helpers */
use crate::helpers::comparison_helper;

/// MongodbSyncProvider - Handle data synchronization between MongoDB and JSON
#[derive(Clone)]
pub struct MongodbSyncProvider {
  pub mongodbCrud: MongodbCrudProvider,
}

impl MongodbSyncProvider {
  pub fn new(mongodbCrud: MongodbCrudProvider) -> Self {
    Self { mongodbCrud }
  }

  /// Export data from local JSON to cloud MongoDB
  /// Records with newer updatedAt in local will overwrite cloud records
  /// NOTE: users and profiles are NOT exported for security reasons
  pub async fn exportToCloud(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    for table in tables {
      let filter = json!({ "userId": userId });
      let localRecords: Vec<Value> = jsonProvider.getAll(table, Some(filter)).await?;

      for localRecord in localRecords {
        let id = localRecord.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
          continue;
        }

        match self.mongodbCrud.get(table, id).await {
          Ok(existingVal) => {
            if comparison_helper::shouldUpdateTarget(&localRecord, &existingVal) {
              let _ = self
                .mongodbCrud
                .update(table, id, localRecord.clone())
                .await;
            }
          }
          Err(_) => {
            let _ = self.mongodbCrud.create(table, localRecord).await;
          }
        }
      }
    }

    Ok(())
  }

  /// Import data from cloud MongoDB to local JSON
  /// Cloud records with newer updatedAt will overwrite local records
  /// Also handles hard deletes if record is deleted in cloud
  pub async fn importToLocal(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    for table in tables {
      let filter = json!({ "userId": userId });
      let cloudRecords: Vec<Value> = self.mongodbCrud.getAll(table, Some(filter)).await?;
      let mut cloudIds = HashSet::new();

      for cloudVal in cloudRecords {
        let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
          continue;
        }
        cloudIds.insert(id.to_string());

        match jsonProvider.get(table, id).await {
          Ok(localVal) => {
            if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
              jsonProvider.update(table, id, cloudVal.clone()).await?;
            }
          }
          Err(_) => {
            jsonProvider.create(table, cloudVal).await?;
          }
        }
      }

      // Handle cloud-side hard deletions (if record existed in local but not in cloud and is marked as deleted locally)
      let localRecords: Vec<Value> = jsonProvider
        .getAll(table, Some(json!({ "userId": userId })))
        .await?;
      for localRecord in localRecords {
        if let Some(id) = localRecord.get("id").and_then(|v| v.as_str()) {
          if !cloudIds.contains(id) {
            let isDeletedLocally = localRecord
              .get("isDeleted")
              .and_then(|v| v.as_bool())
              .unwrap_or(false);
            if isDeletedLocally {
              jsonProvider.hardDelete(table, id).await?;
            }
          }
        }
      }
    }

    Ok(())
  }
}
