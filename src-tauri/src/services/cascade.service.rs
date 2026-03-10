/* sys lib */
use futures::future::BoxFuture;
use futures::FutureExt;
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::helpers::response_helper::errResponseFormatted;
use crate::helpers::timestamp_helper;
use crate::models::response_model::ResponseModel;

#[derive(Clone)]
pub struct CascadeService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl CascadeService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  /// Collect all cascade IDs recursively for JSON
  pub fn collectJsonCascadeIds<'a>(
    &'a self,
    table: &'a str,
    id: &'a str,
    taskIds: &'a mut Vec<String>,
    subtaskIds: &'a mut Vec<String>,
    chatIds: &'a mut Vec<String>,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      if table == "todos" {
        let tasks: Vec<serde_json::Value> = self
          .jsonProvider
          .jsonCrud
          .getAll("tasks", Some(json!({"todoId": id})))
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for task in tasks {
          if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
            taskIds.push(taskId.to_string());
            self
              .collectJsonCascadeIds("tasks", taskId, taskIds, subtaskIds, chatIds)
              .await?;
          }
        }

        let chats: Vec<serde_json::Value> = self
          .jsonProvider
          .jsonCrud
          .getAll("chats", Some(json!({ "todoId": id })))
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for chat in chats {
          if let Some(chatId) = chat.get("id").and_then(|v| v.as_str()) {
            chatIds.push(chatId.to_string());
          }
        }
      } else if table == "tasks" {
        let subtasks: Vec<serde_json::Value> = self
          .jsonProvider
          .jsonCrud
          .getAll("subtasks", Some(json!({"taskId": id})))
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for subtask in subtasks {
          if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
            subtaskIds.push(subtaskId.to_string());
          }
        }
      }
      Ok(())
    }
    .boxed()
  }

  /// Handle JSON Cascade (delete/restore)
  pub async fn handleJsonCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<(), ResponseModel> {
    let mut taskIds = Vec::new();
    let mut subtaskIds = Vec::new();
    let mut chatIds = Vec::new();

    self
      .collectJsonCascadeIds(table, id, &mut taskIds, &mut subtaskIds, &mut chatIds)
      .await?;

    let timestamp = timestamp_helper::getCurrentTimestamp();
    let updateData = json!({ "isDeleted": !isRestore, "updatedAt": timestamp });

    for tid in taskIds {
      let _ = self
        .jsonProvider
        .jsonCrud
        .update("tasks", &tid, updateData.clone())
        .await;
    }
    for sid in subtaskIds {
      let _ = self
        .jsonProvider
        .jsonCrud
        .update("subtasks", &sid, updateData.clone())
        .await;
    }
    for cid in chatIds {
      let _ = self
        .jsonProvider
        .jsonCrud
        .update("chats", &cid, updateData.clone())
        .await;
    }

    Ok(())
  }

  /// Handle Mongo Cascade (delete/restore)
  pub async fn handleMongoCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<(), ResponseModel> {
    if let Some(ref mongodb) = self.mongodbProvider {
      let mut taskIds = Vec::new();
      let mut subtaskIds = Vec::new();
      let mut chatIds = Vec::new();

      // We can use the same collection logic for Mongo if we use mongodb provider to fetch
      if table == "todos" {
        let tasks = mongodb
          .mongodbCrud
          .getAll("tasks", Some(json!({"todoId": id})))
          .await
          .map_err(|e| errResponseFormatted("Mongo cascade failed", &e.to_string()))?;

        for task in tasks {
          if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
            taskIds.push(taskId.to_string());
            // Recursive for subtasks
            let subtasks = mongodb
              .mongodbCrud
              .getAll("subtasks", Some(json!({"taskId": taskId})))
              .await
              .unwrap_or_default();
            for subtask in subtasks {
              if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
                subtaskIds.push(subtaskId.to_string());
              }
            }
          }
        }

        let chats = mongodb
          .mongodbCrud
          .getAll("chats", Some(json!({ "todoId": id })))
          .await
          .unwrap_or_default();

        for chat in chats {
          if let Some(chatId) = chat.get("id").and_then(|v| v.as_str()) {
            chatIds.push(chatId.to_string());
          }
        }
      } else if table == "tasks" {
        let subtasks = mongodb
          .mongodbCrud
          .getAll("subtasks", Some(json!({"taskId": id})))
          .await
          .map_err(|e| errResponseFormatted("Mongo cascade failed", &e.to_string()))?;

        for subtask in subtasks {
          if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
            subtaskIds.push(subtaskId.to_string());
          }
        }
      }

      let timestamp = timestamp_helper::getCurrentTimestamp();
      let updateData = json!({ "isDeleted": !isRestore, "updatedAt": timestamp });

      for tid in taskIds {
        let _ = mongodb
          .mongodbCrud
          .update("tasks", &tid, updateData.clone())
          .await;
      }
      for sid in subtaskIds {
        let _ = mongodb
          .mongodbCrud
          .update("subtasks", &sid, updateData.clone())
          .await;
      }
      for cid in chatIds {
        let _ = mongodb
          .mongodbCrud
          .update("chats", &cid, updateData.clone())
          .await;
      }
    }
    Ok(())
  }
}
