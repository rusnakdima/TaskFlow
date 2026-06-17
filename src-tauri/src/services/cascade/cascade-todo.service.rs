use std::collections::HashSet;
use std::sync::Arc;

use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};

use crate::models::response::ResponseModel;

use crate::utils::response_helper::err_response_formatted;

use super::{CascadeResult, CascadeService};

impl CascadeService {
  pub async fn sync_todo_with_children(
    &self,
    todo_id: &str,
    source_provider_name: &str,
    target_provider_name: &str,
    target_visibility: &str,
    delete_from_source: bool,
  ) -> Result<CascadeResult, ResponseModel> {
    let mut result = CascadeResult::new();

    let source_is_mongo = source_provider_name == "Mongo";
    let target_is_mongo = target_provider_name == "Mongo";

    let todo = if source_is_mongo {
      if let Some(ref mongo) = self.mongodb_provider {
        mongo.find_by_id("todos", todo_id).await.ok().flatten()
      } else {
        None
      }
    } else {
      self
        .json_provider
        .find_by_id("todos", todo_id)
        .await
        .ok()
        .flatten()
    };

    let Some(todo) = todo else {
      return Ok(result);
    };

    let should_sync = if let Some(ref mongo) = self.mongodb_provider {
      if source_is_mongo {
        if let Ok(Some(json_todo)) = self.json_provider.find_by_id("todos", todo_id).await {
          json_todo
            .get("visibility")
            .and_then(|v| v.as_str())
            .map(|v| v == "private")
            .unwrap_or(false)
        } else {
          false
        }
      } else {
        false
      }
    } else {
      false
    };

    if should_sync {
      let _ = self.sync_entity_to_json("todos", todo_id).await?;
    }

    let now = chrono::Utc::now().to_rfc3339();

    if target_is_mongo {
      let update_data = serde_json::json!({
        "visibility": target_visibility,
        "updated_at": now
      });
      let _ = self
        .json_provider
        .patch("todos", todo_id, update_data)
        .await;
      if let Some(ref mongo) = self.mongodb_provider {
        let update_data = serde_json::json!({
          "visibility": target_visibility,
          "updated_at": now
        });
        let _ = mongo.patch("todos", todo_id, update_data).await;
      }
    } else {
      let _ = self.sync_entity_to_mongo("todos", todo_id).await?;
      if let Some(ref mongo) = self.mongodb_provider {
        let update_data = serde_json::json!({
          "visibility": target_visibility,
          "updated_at": now
        });
        let _ = mongo.patch("todos", todo_id, update_data).await;
      }
    }

    let task_filter =
      nosql_orm::query::Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id));

    let tasks = if source_provider_name == "Mongo" {
      if let Some(ref mongo) = self.mongodb_provider {
        mongo
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
          .unwrap_or_default()
      } else {
        Vec::new()
      }
    } else {
      self
        .json_provider
        .find_many("tasks", Some(&task_filter), None, None, None, true)
        .await
        .unwrap_or_default()
    };

    for task in &tasks {
      if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
        let sync_result = self
          .sync_task_with_children(
            task_id,
            target_is_mongo,
            target_visibility,
            delete_from_source && source_provider_name == "Json",
          )
          .await;
        if sync_result.is_ok() {
          result.task_count += 1;
        }
      }
    }

    if delete_from_source && source_provider_name == "Json" {
      let _ = self.permanent_delete_cascade_json("todos", todo_id).await;
    }

    result.todo_count = 1;
    Ok(result)
  }

  pub async fn sync_task_with_children(
    &self,
    task_id: &str,
    to_mongo: bool,
    visibility: &str,
    delete_from_source: bool,
  ) -> Result<CascadeResult, ResponseModel> {
    let mut result = CascadeResult::new();

    if !to_mongo {
      if let Some(ref mongo) = self.mongodb_provider {
        if let Ok(Some(task)) = mongo.find_by_id("tasks", task_id).await {
          if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
            if let Ok(Some(todo)) = mongo.find_by_id("todos", todo_id).await {
              if let Some(todo_visibility) = todo.get("visibility").and_then(|v| v.as_str()) {
                if todo_visibility != "private" {
                  return Ok(CascadeResult::new());
                }
              }
            }
          }
        }
      }
    }

    let subtask_filter =
      nosql_orm::query::Filter::Eq("task_id".to_string(), serde_json::json!(task_id));

    let subtasks = if to_mongo {
      self
        .json_provider
        .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
        .await
        .unwrap_or_default()
    } else {
      if let Some(ref mongo) = self.mongodb_provider {
        mongo
          .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
          .await
          .unwrap_or_default()
      } else {
        Vec::new()
      }
    };

    let target_str = if to_mongo { "Mongo" } else { "Json" };

    let _ = self
      .sync_child_entity("tasks", task_id, target_str, visibility)
      .await;

    for subtask in &subtasks {
      if let Some(subtask_id) = subtask.get("id").and_then(|v| v.as_str()) {
        let _ = self
          .sync_child_entity("subtasks", subtask_id, target_str, visibility)
          .await;
        result.subtask_count += 1;
      }
    }

    let comment_filter =
      nosql_orm::query::Filter::Eq("task_id".to_string(), serde_json::json!(task_id));

    let comments = if to_mongo {
      self
        .json_provider
        .find_many("comments", Some(&comment_filter), None, None, None, true)
        .await
        .unwrap_or_default()
    } else {
      if let Some(ref mongo) = self.mongodb_provider {
        mongo
          .find_many("comments", Some(&comment_filter), None, None, None, true)
          .await
          .unwrap_or_default()
      } else {
        Vec::new()
      }
    };

    for comment in &comments {
      if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
        let _ = self
          .sync_child_entity("comments", comment_id, target_str, visibility)
          .await;
        result.comment_count += 1;
      }
    }

    if delete_from_source && to_mongo {
      let _ = self.permanent_delete_cascade_json("tasks", task_id).await;
    }

    Ok(result)
  }

  async fn sync_child_entity(
    &self,
    table: &str,
    id: &str,
    target_provider: &str,
    _visibility: &str,
  ) -> Result<(), ResponseModel> {
    let entity_opt = if target_provider == "Mongo" {
      self
        .json_provider
        .find_by_id(table, id)
        .await
        .ok()
        .flatten()
    } else {
      if let Some(ref mongo) = self.mongodb_provider {
        mongo.find_by_id(table, id).await.ok().flatten()
      } else {
        None
      }
    };

    let Some(entity) = entity_opt else {
      return Ok(());
    };

    let sanitized = {
      fn sanitize_for_mongo_replacement(value: serde_json::Value) -> serde_json::Value {
        if let serde_json::Value::Object(obj) = value {
          let mut filtered = serde_json::Map::new();
          for (k, v) in obj.iter() {
            if !k.starts_with('$') {
              filtered.insert(k.clone(), sanitize_for_mongo_replacement(v.clone()));
            }
          }
          serde_json::Value::Object(filtered)
        } else {
          value
        }
      }
      sanitize_for_mongo_replacement(entity)
    };

    if target_provider == "Mongo" {
      if let Some(ref mongo) = self.mongodb_provider {
        match mongo.find_by_id(table, id).await {
          Ok(Some(_)) => {
            let _ = mongo.update(table, id, sanitized).await;
          }
          Ok(None) => {
            let _ = mongo.insert(table, sanitized).await;
          }
          Err(_) => {}
        }
      }
    } else {
      match self.json_provider.find_by_id(table, id).await {
        Ok(Some(_)) => {
          let _ = self.json_provider.update(table, id, sanitized).await;
        }
        Ok(None) => {
          let _ = self.json_provider.insert(table, sanitized).await;
        }
        Err(_) => {}
      }
    }

    Ok(())
  }
}