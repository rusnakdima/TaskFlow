/* sys lib */
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::error::OrmResult;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;
use serde_json::{json, Value};

pub struct CountService {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl Clone for CountService {
  fn clone(&self) -> Self {
    CountService {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
    }
  }
}

impl CountService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  async fn increment_count<P>(
    &self,
    provider: &P,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
    is_json: bool,
  ) -> OrmResult<()>
  where
    P: Clone + nosql_orm::provider::DatabaseProvider,
  {
    let current = provider.find_by_id(collection, id).await?;
    if let Some(mut doc) = current {
      if let Some(obj) = doc.as_object_mut() {
        let current_val = obj.get(field).and_then(|v| v.as_i64()).unwrap_or(0);
        obj.insert(
          field.to_string(),
          serde_json::json!(current_val + delta as i64),
        );
        provider.update(collection, id, doc).await?;
      }
    }
    Ok(())
  }

  async fn decrement_count<P>(
    &self,
    provider: &P,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
    is_json: bool,
  ) -> OrmResult<()>
  where
    P: Clone + nosql_orm::provider::DatabaseProvider,
  {
    self
      .increment_count(provider, collection, id, field, -delta, is_json)
      .await
  }

  async fn increment_count_both(
    &self,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
    offline: bool,
  ) {
    if let Err(e) = self
      .increment_count(&self.json_provider, collection, id, field, delta, true)
      .await
    {
      eprintln!(
        "Failed to increment count in JSON (collection={}, id={}, field={}): {}",
        collection, id, field, e
      );
    }
    if !offline {
      if let Some(mongo) = self.mongodb_provider.as_ref() {
        if let Err(e) = self
          .increment_count(mongo.as_ref(), collection, id, field, delta, false)
          .await
        {
          eprintln!(
            "Failed to increment count in MongoDB (collection={}, id={}, field={}): {}",
            collection, id, field, e
          );
        }
      }
    }
  }

  async fn decrement_count_both(
    &self,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
    offline: bool,
  ) {
    if let Err(e) = self
      .decrement_count(&self.json_provider, collection, id, field, delta, true)
      .await
    {
      eprintln!(
        "Failed to decrement count in JSON (collection={}, id={}, field={}): {}",
        collection, id, field, e
      );
    }
    if !offline {
      if let Some(mongo) = self.mongodb_provider.as_ref() {
        if let Err(e) = self
          .decrement_count(mongo.as_ref(), collection, id, field, delta, false)
          .await
        {
          eprintln!(
            "Failed to decrement count in MongoDB (collection={}, id={}, field={}): {}",
            collection, id, field, e
          );
        }
      }
    }
  }

  pub async fn on_task_created(&self, todo_id: &str, offline: bool) {
    self
      .increment_count_both("todos", todo_id, "tasks_count", 1, offline)
      .await;
  }

  pub async fn on_task_completed(&self, todo_id: &str, offline: bool) {
    self
      .increment_count_both("todos", todo_id, "completed_tasks_count", 1, offline)
      .await;
  }

  pub async fn on_task_deleted(&self, todo_id: &str, was_completed: bool, offline: bool) {
    self
      .decrement_count_both("todos", todo_id, "tasks_count", 1, offline)
      .await;
    if was_completed {
      self
        .decrement_count_both("todos", todo_id, "completed_tasks_count", 1, offline)
        .await;
    }
  }

  pub async fn on_task_restored(&self, todo_id: &str, is_completed: bool, offline: bool) {
    self
      .increment_count_both("todos", todo_id, "tasks_count", 1, offline)
      .await;
    if is_completed {
      self
        .increment_count_both("todos", todo_id, "completed_tasks_count", 1, offline)
        .await;
    }
  }

  pub async fn on_task_uncompleted(&self, todo_id: &str, offline: bool) {
    self
      .decrement_count_both("todos", todo_id, "completed_tasks_count", 1, offline)
      .await;
  }

  pub async fn on_subtask_created(&self, task_id: &str, _todo_id: &str, offline: bool) {
    self
      .increment_count_both("tasks", task_id, "subtasks_count", 1, offline)
      .await;
  }

  pub async fn on_subtask_completed(&self, task_id: &str, _todo_id: &str, offline: bool) {
    self
      .increment_count_both("tasks", task_id, "completed_subtasks_count", 1, offline)
      .await;
  }

  pub async fn on_subtask_deleted(
    &self,
    task_id: &str,
    _todo_id: &str,
    was_completed: bool,
    offline: bool,
  ) {
    self
      .decrement_count_both("tasks", task_id, "subtasks_count", 1, offline)
      .await;
    if was_completed {
      self
        .decrement_count_both("tasks", task_id, "completed_subtasks_count", 1, offline)
        .await;
    }
  }

  pub async fn on_subtask_restored(
    &self,
    task_id: &str,
    _todo_id: &str,
    is_completed: bool,
    offline: bool,
  ) {
    self
      .increment_count_both("tasks", task_id, "subtasks_count", 1, offline)
      .await;
    if is_completed {
      self
        .increment_count_both("tasks", task_id, "completed_subtasks_count", 1, offline)
        .await;
    }
  }

  pub async fn on_subtask_uncompleted(&self, task_id: &str, _todo_id: &str, offline: bool) {
    self
      .decrement_count_both("tasks", task_id, "completed_subtasks_count", 1, offline)
      .await;
  }

  pub async fn on_comment_created(
    &self,
    task_id: Option<&str>,
    subtask_id: Option<&str>,
    offline: bool,
  ) {
    if let Some(subtask_id) = subtask_id {
      self
        .increment_count_both("subtasks", subtask_id, "comments_count", 1, offline)
        .await;
      if let Some(task_id) = task_id {
        self
          .increment_count_both("tasks", task_id, "comments_count", 1, offline)
          .await;
      }
    } else if let Some(task_id) = task_id {
      self
        .increment_count_both("tasks", task_id, "comments_count", 1, offline)
        .await;
    }
  }

  pub async fn on_comment_deleted(
    &self,
    task_id: Option<&str>,
    subtask_id: Option<&str>,
    offline: bool,
  ) {
    if let Some(subtask_id) = subtask_id {
      self
        .decrement_count_both("subtasks", subtask_id, "comments_count", 1, offline)
        .await;
      if let Some(task_id) = task_id {
        self
          .decrement_count_both("tasks", task_id, "comments_count", 1, offline)
          .await;
      }
    } else if let Some(task_id) = task_id {
      self
        .decrement_count_both("tasks", task_id, "comments_count", 1, offline)
        .await;
    }
  }

  pub async fn refresh_todo_counts<P>(
    &self,
    todo_id: &str,
    provider: &P,
    is_json: bool,
  ) -> OrmResult<()>
  where
    P: Clone + nosql_orm::provider::DatabaseProvider,
  {
    let task_filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id));

    let all_tasks = provider
      .find_many("tasks", Some(&task_filter), None, None, None, true)
      .await?;

    let non_deleted_tasks: Vec<&Value> = all_tasks
      .iter()
      .filter(|t| t.get("deleted_at").is_none())
      .collect();

    let tasks_count = non_deleted_tasks.len() as i32;

    let completed_count = non_deleted_tasks
      .iter()
      .filter(|t| {
        t.get("completed")
          .and_then(|v| v.as_bool())
          .unwrap_or(false)
      })
      .count() as i32;

    if is_json {
      if let Some(mut todo) = provider.find_by_id("todos", todo_id).await? {
        if let Some(obj) = todo.as_object_mut() {
          obj.insert("tasks_count".to_string(), serde_json::json!(tasks_count));
          obj.insert(
            "completed_tasks_count".to_string(),
            serde_json::json!(completed_count),
          );
          provider.update("todos", todo_id, todo).await?;
        }
      }
    } else {
      let update = json!({
        "tasks_count": tasks_count,
        "completed_tasks_count": completed_count
      });
      provider.patch("todos", todo_id, update).await?;
    }

    Ok(())
  }

  pub async fn refresh_task_counts<P>(
    &self,
    task_id: &str,
    provider: &P,
    is_json: bool,
  ) -> OrmResult<()>
  where
    P: Clone + nosql_orm::provider::DatabaseProvider,
  {
    let subtask_filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));

    let all_subtasks = provider
      .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
      .await?;

    let non_deleted_subtasks: Vec<&Value> = all_subtasks
      .iter()
      .filter(|t| t.get("deleted_at").is_none())
      .collect();

    let subtasks_count = non_deleted_subtasks.len() as i32;

    let completed_count = non_deleted_subtasks
      .iter()
      .filter(|t| {
        t.get("completed")
          .and_then(|v| v.as_bool())
          .unwrap_or(false)
      })
      .count() as i32;

    if is_json {
      if let Some(mut task) = provider.find_by_id("tasks", task_id).await? {
        if let Some(obj) = task.as_object_mut() {
          obj.insert(
            "subtasks_count".to_string(),
            serde_json::json!(subtasks_count),
          );
          obj.insert(
            "completed_subtasks_count".to_string(),
            serde_json::json!(completed_count),
          );
          provider.update("tasks", task_id, task).await?;
        }
      }
    } else {
      let update = json!({
        "subtasks_count": subtasks_count,
        "completed_subtasks_count": completed_count
      });
      provider.patch("tasks", task_id, update).await?;
    }

    Ok(())
  }
}
