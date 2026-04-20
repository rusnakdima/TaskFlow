/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;
use std::sync::Arc;

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

  /// Helper to get user_id for a given entity in a given table
  pub async fn getUserIdForEntity(&self, table: &str, data: &Value) -> Option<String> {
    if let Some(userId) = data.get("user_id").and_then(|v| v.as_str()) {
      return Some(userId.to_string());
    }

    if table == "tasks" {
      if let Some(todoId) = data.get("todo_id").and_then(|v| v.as_str()) {
        if let Ok(Some(todo)) = self.jsonProvider.find_by_id("todos", todoId).await {
          return todo
            .get("user_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        }
        if let Some(ref mongodb) = self.mongodbProvider {
          if let Ok(Some(task)) = mongodb.find_by_id("tasks", todoId).await {
            if let Some(userId) = task.get("user_id").and_then(|v| v.as_str()) {
              return Some(userId.to_string());
            }
          }
        }
      }
    }

    if table == "subtasks" {
      if let Some(taskId) = data.get("task_id").and_then(|v| v.as_str()) {
        if let Ok(Some(task)) = self.jsonProvider.find_by_id("tasks", taskId).await {
          if let Some(todoId) = task.get("todo_id").and_then(|v| v.as_str()) {
            if let Ok(Some(todo)) = self.jsonProvider.find_by_id("todos", todoId).await {
              return todo
                .get("user_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            }
          }
        }
        if let Some(ref mongodb) = self.mongodbProvider {
          if let Ok(Some(task)) = mongodb.find_by_id("tasks", taskId).await {
            if let Some(todoId) = task.get("todo_id").and_then(|v| v.as_str()) {
              if let Ok(Some(todo)) = mongodb.find_by_id("todos", todoId).await {
                return todo
                  .get("user_id")
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