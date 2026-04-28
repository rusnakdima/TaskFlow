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
  fn eq_filter(field: &str, value: &str) -> Filter {
    Filter::Eq(field.to_string(), json!(value))
  }

  fn in_filter(field: &str, values: &[String]) -> Filter {
    Filter::In(
      field.to_string(),
      values.iter().map(|id| json!(id)).collect(),
    )
  }

  fn comment_filter(task_ids: &[String], subtask_ids: &[String]) -> Filter {
    if subtask_ids.is_empty() {
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
    }
  }

  async fn sync_todo_to_mongo(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    todo: &Value,
    _todo_id: &str,
    new_visibility: &str,
  ) -> bool {
    if let Some(id) = todo.get("id").and_then(|v| v.as_str()) {
      let mut updated = todo.clone();
      if let Some(obj) = updated.as_object_mut() {
        obj.insert("visibility".to_string(), json!(new_visibility));
      }
      if Self::should_sync_to_mongo(mongo, "todos", id, &updated).await {
        if mongo.find_by_id("todos", id).await.ok().flatten().is_some() {
          if let Err(e) = mongo.patch("todos", id, updated.clone()).await {
            tracing::warn!(
              "[VisibilitySync] Failed to patch todo {} in sync_todo_to_mongo: {}",
              id,
              e
            );
          }
        } else {
          if let Err(e) = mongo.insert("todos", updated.clone()).await {
            tracing::warn!(
              "[VisibilitySync] Failed to insert todo {} in sync_todo_to_mongo: {}",
              id,
              e
            );
          }
        }
        let now = chrono::Utc::now();
        if let Err(e) = json_provider
          .patch(
            "todos",
            id,
            json!({"visibility": new_visibility, "deleted_at": now}),
          )
          .await
        {
          tracing::warn!(
            "[VisibilitySync] Failed to patch todo {} in json_provider: {}",
            id,
            e
          );
        }
        if let Err(e) = mongo
          .patch("todos", id, json!({ "deleted_at": Value::Null }))
          .await
        {
          tracing::warn!(
            "[VisibilitySync] Failed to patch todo {} deleted_at in mongo: {}",
            id,
            e
          );
        }
        return true;
      }
    }
    false
  }

  async fn sync_entity_to_mongo(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    table: &str,
    entity: &Value,
    new_visibility: &str,
  ) -> bool {
    if let Some(id) = entity.get("id").and_then(|v| v.as_str()) {
      let mut updated = entity.clone();
      if let Some(obj) = updated.as_object_mut() {
        obj.insert("visibility".to_string(), json!(new_visibility));
        obj.insert("deleted_at".to_string(), Value::Null);
      }
      if Self::should_sync_to_mongo(mongo, table, id, &updated).await {
        if mongo.find_by_id(table, id).await.ok().flatten().is_some() {
          if let Err(e) = mongo.patch(table, id, updated).await {
            tracing::warn!(
              "[VisibilitySync] Failed to patch {} {} in sync_entity_to_mongo: {}",
              table,
              id,
              e
            );
          }
        } else {
          if let Err(e) = mongo.insert(table, updated).await {
            tracing::warn!(
              "[VisibilitySync] Failed to insert {} {} in sync_entity_to_mongo: {}",
              table,
              id,
              e
            );
          }
        }
        let now = chrono::Utc::now();
        if let Err(e) = json_provider
          .patch(
            table,
            id,
            json!({"visibility": new_visibility, "deleted_at": now}),
          )
          .await
        {
          tracing::warn!(
            "[VisibilitySync] Failed to patch {} {} in json_provider: {}",
            table,
            id,
            e
          );
        }
        return true;
      }
    }
    false
  }

  async fn sync_todo_to_json(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    todo: &Value,
    _todo_id: &str,
    new_visibility: &str,
  ) -> bool {
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
          if let Err(e) = json_provider.patch("todos", id, updated).await {
            tracing::warn!(
              "[VisibilitySync] Failed to patch todo {} in sync_todo_to_json: {}",
              id,
              e
            );
          }
        } else {
          if let Err(e) = json_provider.insert("todos", updated).await {
            tracing::warn!(
              "[VisibilitySync] Failed to insert todo {} in sync_todo_to_json: {}",
              id,
              e
            );
          }
        }
        let now = chrono::Utc::now();
        if let Err(e) = mongo
          .patch(
            "todos",
            id,
            json!({"visibility": new_visibility, "deleted_at": now}),
          )
          .await
        {
          tracing::warn!(
            "[VisibilitySync] Failed to patch todo {} in mongo: {}",
            id,
            e
          );
        }
        if let Err(e) = json_provider
          .patch("todos", id, json!({ "deleted_at": Value::Null }))
          .await
        {
          tracing::warn!(
            "[VisibilitySync] Failed to patch todo {} deleted_at in json_provider: {}",
            id,
            e
          );
        }
        return true;
      }
    }
    false
  }

  async fn sync_entity_to_json(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    table: &str,
    entity: &Value,
    new_visibility: &str,
  ) -> bool {
    if let Some(id) = entity.get("id").and_then(|v| v.as_str()) {
      let mut updated = entity.clone();
      if let Some(obj) = updated.as_object_mut() {
        obj.insert("visibility".to_string(), json!(new_visibility));
        obj.insert("deleted_at".to_string(), Value::Null);
      }
      if Self::should_sync_to_json(json_provider, table, id, &updated).await {
        if json_provider
          .find_by_id(table, id)
          .await
          .ok()
          .flatten()
          .is_some()
        {
          if let Err(e) = json_provider.patch(table, id, updated).await {
            tracing::warn!(
              "[VisibilitySync] Failed to patch {} {} in sync_entity_to_json: {}",
              table,
              id,
              e
            );
          }
        } else {
          if let Err(e) = json_provider.insert(table, updated).await {
            tracing::warn!(
              "[VisibilitySync] Failed to insert {} {} in sync_entity_to_json: {}",
              table,
              id,
              e
            );
          }
        }
        let now = chrono::Utc::now();
        if let Err(e) = mongo
          .patch(
            table,
            id,
            json!({"visibility": new_visibility, "deleted_at": now}),
          )
          .await
        {
          tracing::warn!(
            "[VisibilitySync] Failed to patch {} {} in mongo: {}",
            table,
            id,
            e
          );
        }
        return true;
      }
    }
    false
  }

  async fn sync_tasks_for_todo(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    tasks: &[Value],
    new_visibility: &str,
    to_mongo: bool,
  ) -> usize {
    let mut count = 0;
    for task in tasks.iter() {
      let synced = if to_mongo {
        Self::sync_entity_to_mongo(json_provider, mongo, "tasks", task, new_visibility).await
      } else {
        Self::sync_entity_to_json(json_provider, mongo, "tasks", task, new_visibility).await
      };
      if synced {
        count += 1;
      }
    }
    count
  }

  async fn sync_subtasks_for_tasks(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    subtasks: &[Value],
    new_visibility: &str,
    to_mongo: bool,
  ) -> usize {
    let mut count = 0;
    for subtask in subtasks.iter() {
      let synced = if to_mongo {
        Self::sync_entity_to_mongo(json_provider, mongo, "subtasks", subtask, new_visibility).await
      } else {
        Self::sync_entity_to_json(json_provider, mongo, "subtasks", subtask, new_visibility).await
      };
      if synced {
        count += 1;
      }
    }
    count
  }

  async fn sync_comments(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    comments: &[Value],
    new_visibility: &str,
    to_mongo: bool,
  ) -> usize {
    let mut count = 0;
    for comment in comments.iter() {
      let synced = if to_mongo {
        Self::sync_entity_to_mongo(json_provider, mongo, "comments", comment, new_visibility).await
      } else {
        Self::sync_entity_to_json(json_provider, mongo, "comments", comment, new_visibility).await
      };
      if synced {
        count += 1;
      }
    }
    count
  }

  async fn sync_chats(
    json_provider: &JsonProvider,
    mongo: &MongoProvider,
    chats: &[Value],
    new_visibility: &str,
    to_mongo: bool,
  ) -> usize {
    let mut count = 0;
    for chat in chats.iter() {
      let synced = if to_mongo {
        Self::sync_entity_to_mongo(json_provider, mongo, "chats", chat, new_visibility).await
      } else {
        Self::sync_entity_to_json(json_provider, mongo, "chats", chat, new_visibility).await
      };
      if synced {
        count += 1;
      }
    }
    count
  }

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
      let todos = json_provider
        .find_many(
          "todos",
          Some(&Self::eq_filter("id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();

      let tasks = json_provider
        .find_many(
          "tasks",
          Some(&Self::eq_filter("todo_id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();

      let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      let subtasks = json_provider
        .find_many(
          "subtasks",
          Some(&Self::in_filter("task_id", &task_ids)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();

      let subtask_ids: Vec<String> = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      let comments = json_provider
        .find_many(
          "comments",
          Some(&Self::comment_filter(&task_ids, &subtask_ids)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();

      let chats = json_provider
        .find_many(
          "chats",
          Some(&Self::eq_filter("todo_id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();

      if let Some(mongo) = mongodb_provider {
        if let Some(todo) = todos
          .iter()
          .find(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
        {
          if Self::sync_todo_to_mongo(json_provider, mongo, todo, &todo_id, new_visibility).await {
            synced_count += 1;
          }
        }

        synced_count +=
          Self::sync_tasks_for_todo(json_provider, mongo, &tasks, new_visibility, true).await;
        synced_count +=
          Self::sync_subtasks_for_tasks(json_provider, mongo, &subtasks, new_visibility, true)
            .await;
        synced_count +=
          Self::sync_comments(json_provider, mongo, &comments, new_visibility, true).await;
        synced_count += Self::sync_chats(json_provider, mongo, &chats, new_visibility, true).await;
      }
    } else if let Some(mongo) = mongodb_provider {
      let todos = mongo
        .find_many(
          "todos",
          Some(&Self::eq_filter("id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();
      let tasks = mongo
        .find_many(
          "tasks",
          Some(&Self::eq_filter("todo_id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();
      let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let subtasks = mongo
        .find_many(
          "subtasks",
          Some(&Self::in_filter("task_id", &task_ids)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();
      let subtask_ids: Vec<String> = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let comments = mongo
        .find_many(
          "comments",
          Some(&Self::comment_filter(&task_ids, &subtask_ids)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();
      let chats = mongo
        .find_many(
          "chats",
          Some(&Self::eq_filter("todo_id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default();

      if let Some(todo) = todos
        .iter()
        .find(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if Self::sync_todo_to_json(json_provider, mongo, todo, &todo_id, new_visibility).await {
          synced_count += 1;
        }
      }

      synced_count +=
        Self::sync_tasks_for_todo(json_provider, mongo, &tasks, new_visibility, false).await;
      synced_count +=
        Self::sync_subtasks_for_tasks(json_provider, mongo, &subtasks, new_visibility, false).await;
      synced_count +=
        Self::sync_comments(json_provider, mongo, &comments, new_visibility, false).await;
      synced_count += Self::sync_chats(json_provider, mongo, &chats, new_visibility, false).await;
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
