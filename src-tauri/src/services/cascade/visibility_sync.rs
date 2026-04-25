/* sys lib */
use chrono;
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  response_entity::{DataValue, ResponseModel},
};

/* helpers */
use crate::helpers::response_helper::success_response;

pub struct VisibilitySyncService;

impl VisibilitySyncService {
  pub async fn sync_todo_visibility(
    json_provider: &JsonProvider,
    mongodb_provider: Option<&Arc<MongoProvider>>,
    todo_id: String,
    source_provider: ProviderType,
    target_provider: ProviderType,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut synced_count = 0;
    let new_visibility = if target_provider == ProviderType::Mongo {
      "team"
    } else {
      "private"
    };

    if source_provider == ProviderType::Json {
      let todo_filter = Filter::Eq("id".to_string(), json!(todo_id.clone()));
      let todos = json_provider
        .find_many("todos", Some(&todo_filter), None, None, None, false)
        .await
        .unwrap_or_default();

      let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id.clone()));
      let tasks = json_provider
        .find_many("tasks", Some(&task_filter), None, None, None, false)
        .await
        .unwrap_or_default();

      let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      let subtask_filter = Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| json!(id)).collect(),
      );
      let subtasks = json_provider
        .find_many("subtasks", Some(&subtask_filter), None, None, None, false)
        .await
        .unwrap_or_default();

      let subtask_ids: Vec<String> = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      let comment_filter = if subtask_ids.is_empty() {
        Filter::In(
          "task_id".to_string(),
          task_ids.iter().map(|id| json!(id)).collect(),
        )
      } else {
        Filter::Or(vec![
          Filter::In(
            "task_id".to_string(),
            task_ids.iter().map(|id| json!(id)).collect(),
          ),
          Filter::In(
            "subtask_id".to_string(),
            subtask_ids.iter().map(|id| json!(id)).collect(),
          ),
        ])
      };
      let comments = json_provider
        .find_many("comments", Some(&comment_filter), None, None, None, false)
        .await
        .unwrap_or_default();

      let chat_filter = Filter::Eq("todo_id".to_string(), json!(todo_id.clone()));
      let chats = json_provider
        .find_many("chats", Some(&chat_filter), None, None, None, false)
        .await
        .unwrap_or_default();

      if let Some(mongo) = mongodb_provider {
        // Sync Todo
        for todo in todos
          .iter()
          .filter(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
        {
          if let Some(id) = todo.get("id").and_then(|v| v.as_str()) {
            let mut updated = todo.clone();
            if let Some(obj) = updated.as_object_mut() {
              obj.insert("visibility".to_string(), json!(new_visibility));
            }
            if Self::should_sync_to_mongo(mongo, "todos", id, &updated).await {
              if mongo.find_by_id("todos", id).await.ok().flatten().is_some() {
                let _ = mongo.patch("todos", id, updated.clone()).await;
              } else {
                let _ = mongo.insert("todos", updated.clone()).await;
              }
              let now = chrono::Utc::now().to_rfc3339();
              let _ = json_provider
                .patch(
                  "todos",
                  id,
                  json!({"visibility": new_visibility, "deleted_at": now}),
                )
                .await;
              let _ = mongo
                .patch("todos", id, json!({ "deleted_at": Value::Null }))
                .await;
              synced_count += 1;
            }
          }
        }

        // Sync Tasks
        for task in tasks.iter() {
          if let Some(id) = task.get("id").and_then(|v| v.as_str()) {
            let mut updated = task.clone();
            if let Some(obj) = updated.as_object_mut() {
              obj.insert("visibility".to_string(), json!(new_visibility));
              obj.insert("deleted_at".to_string(), Value::Null);
            }
            if Self::should_sync_to_mongo(mongo, "tasks", id, &updated).await {
              if mongo.find_by_id("tasks", id).await.ok().flatten().is_some() {
                let _ = mongo.patch("tasks", id, updated).await;
              } else {
                let _ = mongo.insert("tasks", updated).await;
              }
              let now = chrono::Utc::now().to_rfc3339();
              let _ = json_provider
                .patch(
                  "tasks",
                  id,
                  json!({"visibility": new_visibility, "deleted_at": now}),
                )
                .await;
              synced_count += 1;
            }
          }
        }

        // Sync Subtasks
        for subtask in subtasks.iter() {
          if let Some(id) = subtask.get("id").and_then(|v| v.as_str()) {
            let mut updated = subtask.clone();
            if let Some(obj) = updated.as_object_mut() {
              obj.insert("visibility".to_string(), json!(new_visibility));
              obj.insert("deleted_at".to_string(), Value::Null);
            }
            if Self::should_sync_to_mongo(mongo, "subtasks", id, &updated).await {
              if mongo
                .find_by_id("subtasks", id)
                .await
                .ok()
                .flatten()
                .is_some()
              {
                let _ = mongo.patch("subtasks", id, updated).await;
              } else {
                let _ = mongo.insert("subtasks", updated).await;
              }
              let now = chrono::Utc::now().to_rfc3339();
              let _ = json_provider
                .patch(
                  "subtasks",
                  id,
                  json!({"visibility": new_visibility, "deleted_at": now}),
                )
                .await;
              synced_count += 1;
            }
          }
        }

        // Sync Comments
        for comment in comments.iter() {
          if let Some(id) = comment.get("id").and_then(|v| v.as_str()) {
            let mut updated = comment.clone();
            if let Some(obj) = updated.as_object_mut() {
              obj.insert("visibility".to_string(), json!(new_visibility));
              obj.insert("deleted_at".to_string(), Value::Null);
            }
            if Self::should_sync_to_mongo(mongo, "comments", id, &updated).await {
              if mongo
                .find_by_id("comments", id)
                .await
                .ok()
                .flatten()
                .is_some()
              {
                let _ = mongo.patch("comments", id, updated).await;
              } else {
                let _ = mongo.insert("comments", updated).await;
              }
              let now = chrono::Utc::now().to_rfc3339();
              let _ = json_provider
                .patch(
                  "comments",
                  id,
                  json!({"visibility": new_visibility, "deleted_at": now}),
                )
                .await;
              synced_count += 1;
            }
          }
        }

        // Sync Chats
        for chat in chats.iter() {
          if let Some(id) = chat.get("id").and_then(|v| v.as_str()) {
            let mut updated = chat.clone();
            if let Some(obj) = updated.as_object_mut() {
              obj.insert("visibility".to_string(), json!(new_visibility));
              obj.insert("deleted_at".to_string(), Value::Null);
            }
            if Self::should_sync_to_mongo(mongo, "chats", id, &updated).await {
              if mongo.find_by_id("chats", id).await.ok().flatten().is_some() {
                let _ = mongo.patch("chats", id, updated).await;
              } else {
                let _ = mongo.insert("chats", updated).await;
              }
              let now = chrono::Utc::now().to_rfc3339();
              let _ = json_provider
                .patch(
                  "chats",
                  id,
                  json!({"visibility": new_visibility, "deleted_at": now}),
                )
                .await;
              synced_count += 1;
            }
          }
        }
      }
    } else if let Some(mongo) = mongodb_provider {
      // SOURCE = MONGO, TARGET = JSON
      let todo_filter = Filter::Eq("id".to_string(), json!(todo_id.clone()));
      let todos = mongo
        .find_many("todos", Some(&todo_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id.clone()));
      let tasks = mongo
        .find_many("tasks", Some(&task_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let subtask_filter = Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| json!(id)).collect(),
      );
      let subtasks = mongo
        .find_many("subtasks", Some(&subtask_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let subtask_ids: Vec<String> = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      let comment_filter = if subtask_ids.is_empty() {
        Filter::In(
          "task_id".to_string(),
          task_ids.iter().map(|id| json!(id)).collect(),
        )
      } else {
        Filter::Or(vec![
          Filter::In(
            "task_id".to_string(),
            task_ids.iter().map(|id| json!(id)).collect(),
          ),
          Filter::In(
            "subtask_id".to_string(),
            subtask_ids.iter().map(|id| json!(id)).collect(),
          ),
        ])
      };
      let comments = mongo
        .find_many("comments", Some(&comment_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let chat_filter = Filter::Eq("todo_id".to_string(), json!(todo_id.clone()));
      let chats = mongo
        .find_many("chats", Some(&chat_filter), None, None, None, false)
        .await
        .unwrap_or_default();

      // Sync Todo
      for todo in todos
        .iter()
        .filter(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = todo.get("id").and_then(|v| v.as_str()) {
          let mut updated = todo.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), json!(new_visibility));
          }
          if Self::should_sync_to_json(json_provider, "todos", id, &updated).await {
            if json_provider
              .find_by_id("todos", id)
              .await
              .ok()
              .flatten()
              .is_some()
            {
              let _ = json_provider.patch("todos", id, updated).await;
            } else {
              let _ = json_provider.insert("todos", updated).await;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "todos",
                id,
                json!({"visibility": new_visibility, "deleted_at": now}),
              )
              .await;
            let _ = json_provider
              .patch("todos", id, json!({ "deleted_at": Value::Null }))
              .await;
            synced_count += 1;
          }
        }
      }

      // Sync Tasks
      for task in tasks.iter() {
        if let Some(id) = task.get("id").and_then(|v| v.as_str()) {
          let mut updated = task.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), json!(new_visibility));
            obj.insert("deleted_at".to_string(), Value::Null);
          }
          if Self::should_sync_to_json(json_provider, "tasks", id, &updated).await {
            if json_provider
              .find_by_id("tasks", id)
              .await
              .ok()
              .flatten()
              .is_some()
            {
              let _ = json_provider.patch("tasks", id, updated).await;
            } else {
              let _ = json_provider.insert("tasks", updated).await;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "tasks",
                id,
                json!({"visibility": new_visibility, "deleted_at": now}),
              )
              .await;
            synced_count += 1;
          }
        }
      }

      // Sync Subtasks
      for subtask in subtasks.iter() {
        if let Some(id) = subtask.get("id").and_then(|v| v.as_str()) {
          let mut updated = subtask.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), json!(new_visibility));
            obj.insert("deleted_at".to_string(), Value::Null);
          }
          if Self::should_sync_to_json(json_provider, "subtasks", id, &updated).await {
            if json_provider
              .find_by_id("subtasks", id)
              .await
              .ok()
              .flatten()
              .is_some()
            {
              let _ = json_provider.patch("subtasks", id, updated).await;
            } else {
              let _ = json_provider.insert("subtasks", updated).await;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "subtasks",
                id,
                json!({"visibility": new_visibility, "deleted_at": now}),
              )
              .await;
            synced_count += 1;
          }
        }
      }

      // Sync Comments
      for comment in comments.iter() {
        if let Some(id) = comment.get("id").and_then(|v| v.as_str()) {
          let mut updated = comment.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), json!(new_visibility));
            obj.insert("deleted_at".to_string(), Value::Null);
          }
          if Self::should_sync_to_json(json_provider, "comments", id, &updated).await {
            if json_provider
              .find_by_id("comments", id)
              .await
              .ok()
              .flatten()
              .is_some()
            {
              let _ = json_provider.patch("comments", id, updated).await;
            } else {
              let _ = json_provider.insert("comments", updated).await;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "comments",
                id,
                json!({"visibility": new_visibility, "deleted_at": now}),
              )
              .await;
            synced_count += 1;
          }
        }
      }

      // Sync Chats
      for chat in chats.iter() {
        if let Some(id) = chat.get("id").and_then(|v| v.as_str()) {
          let mut updated = chat.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), json!(new_visibility));
            obj.insert("deleted_at".to_string(), Value::Null);
          }
          if Self::should_sync_to_json(json_provider, "chats", id, &updated).await {
            if json_provider
              .find_by_id("chats", id)
              .await
              .ok()
              .flatten()
              .is_some()
            {
              let _ = json_provider.patch("chats", id, updated).await;
            } else {
              let _ = json_provider.insert("chats", updated).await;
            }
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "chats",
                id,
                json!({"visibility": new_visibility, "deleted_at": now}),
              )
              .await;
            synced_count += 1;
          }
        }
      }
    }

    Ok(success_response(DataValue::Number(synced_count as f64)))
  }

  async fn should_sync_to_mongo(
    mongo: &MongoProvider,
    table: &str,
    id: &str,
    new_data: &Value,
  ) -> bool {
    let existing = mongo.find_by_id(table, id).await.ok().flatten();
    let existing_time = existing.as_ref().and_then(|e| {
      e.get("updated_at")
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
    });
    let new_time = new_data
      .get("updated_at")
      .and_then(|v| v.as_str())
      .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());

    match (existing_time, new_time) {
      (Some(e), Some(n)) => n > e,
      (None, _) => true,
      _ => false,
    }
  }

  async fn should_sync_to_json(
    json: &JsonProvider,
    table: &str,
    id: &str,
    new_data: &Value,
  ) -> bool {
    let existing = json.find_by_id(table, id).await.ok().flatten();
    let existing_time = existing.as_ref().and_then(|e| {
      e.get("updated_at")
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
    });
    let new_time = new_data
      .get("updated_at")
      .and_then(|v| v.as_str())
      .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());

    match (existing_time, new_time) {
      (Some(e), Some(n)) => n > e,
      (None, _) => true,
      _ => false,
    }
  }
}
