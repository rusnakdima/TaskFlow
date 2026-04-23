/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;
use std::sync::Arc;

/* providers */
use nosql_orm::providers::{JsonProvider, MongoProvider};

#[derive(Clone)]
pub struct EntityResolutionService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

impl EntityResolutionService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  /// Helper to get user_id for a given entity in a given table
  pub async fn get_user_id_for_entity(&self, table: &str, data: &Value) -> Option<String> {
    if let Some(user_id) = data.get("user_id").and_then(|v| v.as_str()) {
      return Some(user_id.to_string());
    }

    if table == "tasks" {
      if let Some(todo_id) = data.get("todo_id").and_then(|v| v.as_str()) {
        if let Ok(Some(todo)) = self.json_provider.find_by_id("todos", todo_id).await {
          return todo
            .get("user_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        }
        if let Some(ref mongodb) = self.mongodb_provider {
          if let Ok(Some(task)) = mongodb.find_by_id("tasks", todo_id).await {
            if let Some(user_id) = task.get("user_id").and_then(|v| v.as_str()) {
              return Some(user_id.to_string());
            }
          }
        }
      }
    }

    if table == "subtasks" {
      if let Some(task_id) = data.get("task_id").and_then(|v| v.as_str()) {
        if let Ok(Some(task)) = self.json_provider.find_by_id("tasks", task_id).await {
          if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
            if let Ok(Some(todo)) = self.json_provider.find_by_id("todos", todo_id).await {
              return todo
                .get("user_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            }
          }
        }
        if let Some(ref mongodb) = self.mongodb_provider {
          if let Ok(Some(task)) = mongodb.find_by_id("tasks", task_id).await {
            if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
              if let Ok(Some(todo)) = mongodb.find_by_id("todos", todo_id).await {
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
