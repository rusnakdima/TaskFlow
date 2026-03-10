/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

#[derive(Clone)]
pub struct EntityResolutionService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl EntityResolutionService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  /// Helper to get userId for a given entity in a given table
  pub async fn getUserIdForEntity(&self, table: &str, data: &Value) -> Option<String> {
    if let Some(userId) = data.get("userId").and_then(|v| v.as_str()) {
      return Some(userId.to_string());
    }

    if table == "tasks" {
      if let Some(todoId) = data.get("todoId").and_then(|v| v.as_str()) {
        if let Ok(todo) = self.jsonProvider.get("todos", todoId).await {
          return todo
            .get("userId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        }
        if let Some(mongodb) = &self.mongodbProvider {
          if let Ok(todo) = mongodb.get("todos", todoId).await {
            return todo
              .get("userId")
              .and_then(|v| v.as_str())
              .map(|s| s.to_string());
          }
        }
      }
    }

    if table == "subtasks" {
      if let Some(taskId) = data.get("taskId").and_then(|v| v.as_str()) {
        if let Ok(task) = self.jsonProvider.get("tasks", taskId).await {
          if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
            if let Ok(todo) = self.jsonProvider.get("todos", todoId).await {
              return todo
                .get("userId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            }
          }
        }
        if let Some(mongodb) = &self.mongodbProvider {
          if let Ok(task) = mongodb.get("tasks", taskId).await {
            if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
              if let Ok(todo) = mongodb.get("todos", todoId).await {
                return todo
                  .get("userId")
                  .and_then(|v| v.as_str())
                  .map(|s| s.to_string());
              }
            }
          }
        }
      }
    }

    None
  }
}
