/* sys lib */
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::Value;
use std::collections::HashSet;

/* providers */
use super::{json_provider::JsonProvider, mongodb_crud_provider::MongodbCrudProvider};

/// MongodbSyncProvider - Handle data synchronization between MongoDB and JSON
#[derive(Clone)]
pub struct MongodbSyncProvider {
  pub mongodbCrud: MongodbCrudProvider,
}

impl MongodbSyncProvider {
  pub fn new(mongodbCrud: MongodbCrudProvider) -> Self {
    Self { mongodbCrud }
  }

  /// Compare updatedAt timestamps - returns true if source is newer than target
  fn shouldUpdateTarget(source: &Value, target: &Value) -> bool {
    let sourceTs = source.get("updatedAt").and_then(|v| v.as_str());
    let targetTs = target.get("updatedAt").and_then(|v| v.as_str());

    match (sourceTs, targetTs) {
      (Some(s), Some(t)) => s > t,
      (Some(_), None) => true,
      (None, Some(_)) => false,
      (None, None) => true,
    }
  }

  /// Export data from local JSON to cloud MongoDB
  /// Records with newer updatedAt in local will overwrite cloud records
  /// NOTE: users and profiles are NOT exported for security reasons
  pub async fn exportToCloud(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Include all tables including profiles and users for sync
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
      "profiles",
      "users",
    ];

    let mut teamTodoIds = HashSet::new();
    let mut teamTaskIds = HashSet::new();

    for table in tables {
      // Skip deleted records handling for users and profiles (they don't have isDeleted field)
      if table != "users" && table != "profiles" {
        // Handle deleted records first - propagate to cloud
        let allLocal = jsonProvider.getDataTable(table).await?;
        let idsToDelete: Vec<(String, Value)> = allLocal
          .into_iter()
          .filter_map(|record| {
            if record.get("isDeleted").and_then(|v| v.as_bool()) == Some(true) {
              let id = record.get("id").and_then(|v| v.as_str())?.to_string();
              Some((id, record))
            } else {
              None
            }
          })
          .collect();

        for (id, localRecord) in idsToDelete {
          let mut shouldHardDeleteLocal = true;

          match self.mongodbCrud.get(table, None, &id).await {
            Ok(mut existingDoc) => {
              let existingVal = serde_json::to_value(&existingDoc)?;

              // Only update cloud to deleted if local record is newer than cloud record
              // If cloud record is newer, it might have been restored by admin
              if Self::shouldUpdateTarget(&localRecord, &existingVal) {
                existingDoc.insert("isDeleted", true);
                existingDoc.insert(
                  "updatedAt",
                  chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                );
                let _ = self.mongodbCrud.update(table, &id, existingDoc).await;
              } else {
                // Cloud is newer (likely restored), so don't hard delete local yet
                // The subsequent importToLocal will update the local record to active
                shouldHardDeleteLocal = false;
              }
            }
            Err(_) => {
              // Record not in cloud, safe to delete locally
            }
          }

          if shouldHardDeleteLocal {
            let _ = jsonProvider.hardDelete(table, &id).await;
          }
        }
      }

      // Fetch local data for this user
      let filter = match table {
        "todos" | "categories" | "daily_activities" => {
          Some(serde_json::json!({ "userId": userId }))
        }
        "profiles" => {
          // Export ALL profiles to MongoDB (not filtered by userId)
          None
        }
        "users" => {
          // Export ALL users to MongoDB (not filtered by userId)
          None
        }
        "tasks" => {
          let todos = jsonProvider
            .getAll("todos", Some(serde_json::json!({ "userId": userId })), None)
            .await?;
          let todoIds: Vec<String> = todos
            .iter()
            .filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
            .collect();
          Some(serde_json::json!({ "todoId": todoIds }))
        }
        "subtasks" => {
          let todos = jsonProvider
            .getAll("todos", Some(serde_json::json!({ "userId": userId })), None)
            .await?;
          let todoIds: Vec<String> = todos
            .iter()
            .filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
            .collect();
          let tasks = jsonProvider
            .getAll(
              "tasks",
              Some(serde_json::json!({ "todoId": todoIds })),
              None,
            )
            .await?;
          let taskIds: Vec<String> = tasks
            .iter()
            .filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
            .collect();
          Some(serde_json::json!({ "taskId": taskIds }))
        }
        _ => None,
      };

      let localRecords = jsonProvider.getAll(table, filter, None).await?;
      for record in localRecords {
        let id = record
          .get("id")
          .and_then(|v| v.as_str())
          .unwrap_or_default()
          .to_string();
        let mut record = record;
        if let Some(obj) = record.as_object_mut() {
          obj.remove("_id");
        }

        let mut syncSuccessful = false;
        match self.mongodbCrud.get(table, None, &id).await {
          Ok(existingDoc) => {
            let existingVal = serde_json::to_value(&existingDoc)?;
            // Only update if local record has newer updatedAt
            if Self::shouldUpdateTarget(&record, &existingVal) {
              let doc: Document = from_bson(to_bson(&record)?)?;
              if self.mongodbCrud.update(table, &id, doc).await.is_ok() {
                syncSuccessful = true;
              }
            } else {
              // Cloud is newer or same, consider it "synced" for deletion purposes
              syncSuccessful = true;
            }
          }
          Err(_) => {
            let doc: Document = from_bson(to_bson(&record)?)?;
            if self.mongodbCrud.create(table, doc).await.is_ok() {
              syncSuccessful = true;
            }
          }
        }

        // If record is successfully in cloud and has team visibility, remove from local
        if syncSuccessful {
          let mut shouldRemoveFromLocal = false;

          if table == "todos" {
            if record.get("visibility").and_then(|v| v.as_str()) == Some("team") {
              teamTodoIds.insert(id.clone());
              shouldRemoveFromLocal = true;
            }
          } else if table == "tasks" {
            let todoId = record
              .get("todoId")
              .and_then(|v| v.as_str())
              .unwrap_or_default();
            if teamTodoIds.contains(todoId) {
              teamTaskIds.insert(id.clone());
              shouldRemoveFromLocal = true;
            }
          } else if table == "subtasks" {
            let taskId = record
              .get("taskId")
              .and_then(|v| v.as_str())
              .unwrap_or_default();
            if teamTaskIds.contains(taskId) {
              shouldRemoveFromLocal = true;
            }
          }

          if shouldRemoveFromLocal {
            let _ = jsonProvider.hardDelete(table, &id).await;
          }
        }
      }
    }

    Ok(())
  }

  /// Import data from cloud MongoDB to local JSON
  /// Records with newer updatedAt in cloud will overwrite local records
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
      "profiles",
      "users",
    ];

    for table in tables {
      let filter = match table {
        "todos" => {
          Some(doc! { "userId": &userId, "isDeleted": { "$ne": true }, "visibility": "private" })
        }
        "categories" | "daily_activities" => {
          Some(doc! { "userId": &userId, "isDeleted": { "$ne": true } })
        }
        "profiles" => {
          // Import ALL profiles from MongoDB (not filtered by userId)
          None
        }
        "users" => {
          // Import ALL users from MongoDB (not filtered by userId)
          None
        }
        "tasks" => {
          let todos = self
            .mongodbCrud
            .getAll(
              "todos",
              Some(doc! { "userId": &userId, "visibility": "private" }),
            )
            .await?;
          let todoIds: Vec<String> = todos
            .iter()
            .filter_map(|doc| doc.get_str("id").ok())
            .map(|s| s.to_string())
            .collect();
          Some(doc! { "todoId": { "$in": todoIds }, "isDeleted": { "$ne": true } })
        }
        "subtasks" => {
          let todos = self
            .mongodbCrud
            .getAll(
              "todos",
              Some(doc! { "userId": &userId, "visibility": "private" }),
            )
            .await?;
          let todoIds: Vec<String> = todos
            .iter()
            .filter_map(|doc| doc.get_str("id").ok())
            .map(|s| s.to_string())
            .collect();
          let tasks = self
            .mongodbCrud
            .getAll("tasks", Some(doc! { "todoId": { "$in": todoIds } }))
            .await?;
          let taskIds: Vec<String> = tasks
            .iter()
            .filter_map(|doc| doc.get_str("id").ok())
            .map(|s| s.to_string())
            .collect();
          Some(doc! { "taskId": { "$in": taskIds }, "isDeleted": { "$ne": true } })
        }
        _ => None,
      };

      let cloudDocs = if table == "profiles" || table == "users" {
        // Use getAllWithDeleted for users and profiles (they don't have isDeleted field)
        self.mongodbCrud.getAllWithDeleted(table, filter).await?
      } else {
        self.mongodbCrud.getAll(table, filter).await?
      };
      let mut cloudIds = Vec::new();

      for doc in cloudDocs {
        let id = doc.get_str("id").unwrap_or_default();
        cloudIds.push(id.to_string());
        let value = serde_json::to_value(&doc)?;

        match jsonProvider.get(table, None, None, id).await {
          Ok(existingVal) => {
            // Only update if cloud record has newer updatedAt
            if Self::shouldUpdateTarget(&value, &existingVal) {
              jsonProvider.update(table, id, value).await?;
            }
          }
          Err(_) => {
            jsonProvider.create(table, value).await?;
          }
        }
      }

      // Hard delete local records that are not in cloud (and were supposed to be there)
      // This handles cases where records were permanently deleted from admin (cloud)
      // We only delete if they are already marked as deleted locally to prevent losing new local work
      if table != "profiles" && table != "users" {
        let allLocal = jsonProvider.getDataTable(table).await?;
        for record in allLocal {
          if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
            let isDeletedLocally = record
              .get("isDeleted")
              .and_then(|v| v.as_bool())
              .unwrap_or(false);
            if !cloudIds.contains(&id.to_string()) && isDeletedLocally {
              jsonProvider.hardDelete(table, id).await?;
            }
          }
        }
      }
    }

    Ok(())
  }
}
