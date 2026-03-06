/* sys lib */
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::Value;

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

  fn shouldUpdateTarget(source: &Value, target: &Value) -> bool {
    let sourceTs = source.get("updatedAt").and_then(|v| v.as_str());
    let targetTs = target.get("updatedAt").and_then(|v| v.as_str());
    match (sourceTs, targetTs) {
      (Some(s), Some(t)) => s > t,
      _ => true,
    }
  }

  /// Export data from local JSON to cloud MongoDB
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
      "profiles",
      "users",
    ];

    for table in tables {
      // Handle deleted records first
      let allLocal = jsonProvider.getDataTable(table).await?;
      let idsToDelete: Vec<String> = allLocal
        .iter()
        .filter_map(|record| {
          if record.get("isDeleted").and_then(|v| v.as_bool()) == Some(true) {
            record.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())
          } else {
            None
          }
        })
        .collect();

      for id in idsToDelete {
        if let Ok(mut existingDoc) = self.mongodbCrud.get(table, None, &id).await {
          existingDoc.insert("isDeleted", true);
          let _ = self.mongodbCrud.update(table, &id, existingDoc).await;
        }
        let _ = jsonProvider.hardDelete(table, &id).await;
      }

      // Fetch local data for this user
      let filter = match table {
        "todos" | "categories" | "daily_activities" => {
          Some(serde_json::json!({ "userId": userId }))
        }
        "tasks" => {
          let todos = jsonProvider.getAll("todos", Some(serde_json::json!({ "userId": userId })), None).await?;
          let todoIds: Vec<String> = todos.iter().filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string())).collect();
          Some(serde_json::json!({ "todoId": todoIds }))
        }
        "subtasks" => {
          let todos = jsonProvider.getAll("todos", Some(serde_json::json!({ "userId": userId })), None).await?;
          let todoIds: Vec<String> = todos.iter().filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string())).collect();
          let tasks = jsonProvider.getAll("tasks", Some(serde_json::json!({ "todoId": todoIds })), None).await?;
          let taskIds: Vec<String> = tasks.iter().filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string())).collect();
          Some(serde_json::json!({ "taskId": taskIds }))
        }
        _ => None,
      };

      let localRecords = jsonProvider.getAll(table, filter, None).await?;
      for record in localRecords {
        let id = record.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let mut record = record;
        if let Some(obj) = record.as_object_mut() {
          obj.remove("_id");
        }

        match self.mongodbCrud.get(table, None, &id).await {
          Ok(existingDoc) => {
            let existingVal = serde_json::to_value(&existingDoc)?;
            if Self::shouldUpdateTarget(&record, &existingVal) {
              let doc: Document = from_bson(to_bson(&record)?)?;
              self.mongodbCrud.update(table, &id, doc).await?;
            }
          }
          Err(_) => {
            let doc: Document = from_bson(to_bson(&record)?)?;
            self.mongodbCrud.create(table, doc).await?;
          }
        }
      }
    }

    Ok(())
  }

  /// Import data from cloud MongoDB to local JSON
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
        "todos" | "categories" | "daily_activities" => {
          Some(doc! { "userId": &userId, "isDeleted": { "$ne": true } })
        }
        "tasks" => {
          let todos = self.mongodbCrud.getAll("todos", Some(doc! { "userId": &userId })).await?;
          let todoIds: Vec<String> = todos.iter().filter_map(|doc| doc.get_str("id").ok()).map(|s| s.to_string()).collect();
          Some(doc! { "todoId": { "$in": todoIds }, "isDeleted": { "$ne": true } })
        }
        "subtasks" => {
          let todos = self.mongodbCrud.getAll("todos", Some(doc! { "userId": &userId })).await?;
          let todoIds: Vec<String> = todos.iter().filter_map(|doc| doc.get_str("id").ok()).map(|s| s.to_string()).collect();
          let tasks = self.mongodbCrud.getAll("tasks", Some(doc! { "todoId": { "$in": todoIds } })).await?;
          let taskIds: Vec<String> = tasks.iter().filter_map(|doc| doc.get_str("id").ok()).map(|s| s.to_string()).collect();
          Some(doc! { "taskId": { "$in": taskIds }, "isDeleted": { "$ne": true } })
        }
        _ => None,
      };

      let cloudDocs = self.mongodbCrud.getAll(table, filter).await?;
      let mut cloudIds = Vec::new();

      for doc in cloudDocs {
        let id = doc.get_str("id").unwrap_or_default();
        cloudIds.push(id.to_string());
        let value = serde_json::to_value(&doc)?;

        match jsonProvider.get(table, None, None, id).await {
          Ok(existingVal) => {
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
      if table != "profiles" && table != "users" {
        let allLocal = jsonProvider.getDataTable(table).await?;
        for record in allLocal {
          if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
            if !cloudIds.contains(&id.to_string()) {
              jsonProvider.hardDelete(table, id).await?;
            }
          }
        }
      }
    }

    Ok(())
  }
}
