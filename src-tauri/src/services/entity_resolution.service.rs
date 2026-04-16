/* sys lib */
use std::sync::Arc;
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;

/* providers */
use nosql_orm::providers::{JsonProvider, MongoProvider};

#[derive(Clone)]
pub struct EntityResolutionService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
}

impl EntityResolutionService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongoProvider>>) -> Self {
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
        if let Ok(Some(todo)) = self.jsonProvider.find_by_id("todos", todoId).await {
          return todo
            .get("userId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        }
        if let Some(ref mongodb) = self.mongodbProvider {
          if let Ok(Some(todo)) = mongodb.find_by_id("todos", todoId).await {
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
        if let Ok(Some(task)) = self.jsonProvider.find_by_id("tasks", taskId).await {
          if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
            if let Ok(Some(todo)) = self.jsonProvider.find_by_id("todos", todoId).await {
              return todo
                .get("userId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            }
          }
        }
        if let Some(ref mongodb) = self.mongodbProvider {
          if let Ok(Some(task)) = mongodb.find_by_id("tasks", taskId).await {
            if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
              if let Ok(Some(todo)) = mongodb.find_by_id("todos", todoId).await {
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
