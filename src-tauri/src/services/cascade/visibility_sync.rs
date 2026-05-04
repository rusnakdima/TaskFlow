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

  async fn sync_todo<P: DatabaseProvider, S: DatabaseProvider>(
    primary: &P,
    secondary: &S,
    table: &str,
    entity: &Value,
    _id: &str,
    new_visibility: &str,
  ) -> bool {
    if let Some(id) = entity.get("id").and_then(|v| v.as_str()) {
      let mut updated = entity.clone();
      if let Some(obj) = updated.as_object_mut() {
        obj.insert("visibility".to_string(), json!(new_visibility));
      }
      if Self::should_sync(primary, table, id, &updated).await {
        if primary.find_by_id(table, id).await.ok().flatten().is_some() {
          if let Err(_e) = primary.patch(table, id, updated).await {}
        } else if let Err(_e) = primary.insert(table, updated).await {
        }
        let now = chrono::Utc::now();
        if let Err(_e) = secondary
          .patch(
            table,
            id,
            json!({"visibility": new_visibility, "deleted_at": now}),
          )
          .await
        {}
        if let Err(_e) = primary
          .patch(table, id, json!({ "deleted_at": Value::Null }))
          .await
        {}
        return true;
      }
    }
    false
  }

  async fn sync_entity<P: DatabaseProvider, S: DatabaseProvider>(
    primary: &P,
    secondary: &S,
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
      if Self::should_sync(primary, table, id, &updated).await {
        if primary.find_by_id(table, id).await.ok().flatten().is_some() {
          if let Err(_e) = primary.patch(table, id, updated).await {}
        } else if let Err(_e) = primary.insert(table, updated).await {
        }
        let now = chrono::Utc::now();
        if let Err(_e) = secondary
          .patch(
            table,
            id,
            json!({"visibility": new_visibility, "deleted_at": now}),
          )
          .await
        {}
        return true;
      }
    }
    false
  }

  async fn sync_batch<P: DatabaseProvider, S: DatabaseProvider>(
    primary: &P,
    secondary: &S,
    table: &str,
    entities: &[Value],
    new_visibility: &str,
  ) -> usize {
    let mut count = 0;
    for entity in entities.iter() {
      if Self::sync_entity(primary, secondary, table, entity, new_visibility).await {
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
      "shared"
    } else {
      "private"
    };

    let todos_from_json = json_provider
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

    let todos_from_mongo = if let Some(mongo) = mongodb_provider {
      mongo
        .find_many(
          "todos",
          Some(&Self::eq_filter("id", &todo_id)),
          None,
          None,
          None,
          false,
        )
        .await
        .unwrap_or_default()
    } else {
      Vec::new()
    };

    let todo_in_json = todos_from_json
      .iter()
      .any(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id));
    let todo_in_mongo = todos_from_mongo
      .iter()
      .any(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id));

    if source_provider == ProviderType::Json {
      let todos = if todo_in_json {
        todos_from_json
      } else if todo_in_mongo {
        todos_from_mongo
      } else {
        return Ok(success_response(DataValue::Number(0.0)));
      };

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
        let mongo = &**mongo;
        if let Some(todo) = todos
          .iter()
          .find(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
        {
          if Self::sync_todo(
            json_provider,
            mongo,
            "todos",
            todo,
            &todo_id,
            new_visibility,
          )
          .await
          {
            synced_count += 1;
          }
        }

        synced_count +=
          Self::sync_batch(json_provider, mongo, "tasks", &tasks, new_visibility).await;
        synced_count +=
          Self::sync_batch(json_provider, mongo, "subtasks", &subtasks, new_visibility).await;
        synced_count +=
          Self::sync_batch(json_provider, mongo, "comments", &comments, new_visibility).await;
        synced_count +=
          Self::sync_batch(json_provider, mongo, "chats", &chats, new_visibility).await;
      }
    } else if let Some(mongo) = mongodb_provider {
      let mongo = &**mongo;
      let todos = if todo_in_mongo {
        todos_from_mongo
      } else if todo_in_json {
        todos_from_json
      } else {
        return Ok(success_response(DataValue::Number(0.0)));
      };

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
        if Self::sync_todo(
          mongo,
          json_provider,
          "todos",
          todo,
          &todo_id,
          new_visibility,
        )
        .await
        {
          synced_count += 1;
        }
      }

      synced_count += Self::sync_batch(mongo, json_provider, "tasks", &tasks, new_visibility).await;
      synced_count +=
        Self::sync_batch(mongo, json_provider, "subtasks", &subtasks, new_visibility).await;
      synced_count +=
        Self::sync_batch(mongo, json_provider, "comments", &comments, new_visibility).await;
      synced_count += Self::sync_batch(mongo, json_provider, "chats", &chats, new_visibility).await;
    }

    Ok(success_response(DataValue::Number(synced_count as f64)))
  }

  async fn should_sync<P: DatabaseProvider>(
    provider: &P,
    table: &str,
    id: &str,
    new_data: &Value,
  ) -> bool {
    let existing = provider.find_by_id(table, id).await.ok().flatten();
    let existing_time = existing.as_ref().and_then(|e: &Value| {
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
