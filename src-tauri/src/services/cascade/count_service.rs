/* sys lib */
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::error::OrmResult;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::json;

/* tracing */
use tracing::warn;

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
  ) -> OrmResult<()>
  where
    P: Clone,
  {
    let update = json!({ "$inc": { field: delta } });
    provider.patch(collection, id, update).await?;
    Ok(())
  }

  async fn decrement_count<P>(
    &self,
    provider: &P,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
  ) -> OrmResult<()>
  where
    P: Clone,
  {
    self
      .increment_count(provider, collection, id, field, -delta)
      .await
  }

  async fn increment_count_both(
    &self,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
  ) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Err(e) = self
        .increment_count(mongo.as_ref(), collection, id, field, delta)
        .await
      {
        warn!(
          "Failed to increment count in MongoDB (collection={}, id={}, field={}): {}",
          collection, id, field, e
        );
      }
    }
    if let Err(e) = self
      .increment_count(&self.json_provider, collection, id, field, delta)
      .await
    {
      warn!(
        "Failed to increment count in JSON (collection={}, id={}, field={}): {}",
        collection, id, field, e
      );
    }
  }

  async fn decrement_count_both(
    &self,
    collection: &str,
    id: &str,
    field: &str,
    delta: i32,
  ) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Err(e) = self
        .decrement_count(mongo.as_ref(), collection, id, field, delta)
        .await
      {
        warn!(
          "Failed to decrement count in MongoDB (collection={}, id={}, field={}): {}",
          collection, id, field, e
        );
      }
    }
    if let Err(e) = self
      .decrement_count(&self.json_provider, collection, id, field, delta)
      .await
    {
      warn!(
        "Failed to decrement count in JSON (collection={}, id={}, field={}): {}",
        collection, id, field, e
      );
    }
  }

  pub async fn on_task_created(&self, todo_id: &str) {
    self
      .increment_count_both("todos", todo_id, "tasks_count", 1)
      .await;
  }

  pub async fn on_task_completed(&self, todo_id: &str) {
    self
      .increment_count_both("todos", todo_id, "completed_tasks_count", 1)
      .await;
  }

  pub async fn on_task_deleted(&self, todo_id: &str, was_completed: bool) {
    self
      .decrement_count_both("todos", todo_id, "tasks_count", 1)
      .await;
    if was_completed {
      self
        .decrement_count_both("todos", todo_id, "completed_tasks_count", 1)
        .await;
    }
  }

  pub async fn on_task_restored(&self, todo_id: &str, is_completed: bool) {
    self
      .increment_count_both("todos", todo_id, "tasks_count", 1)
      .await;
    if is_completed {
      self
        .increment_count_both("todos", todo_id, "completed_tasks_count", 1)
        .await;
    }
  }

  pub async fn on_subtask_created(&self, task_id: &str, todo_id: &str) {
    self
      .increment_count_both("tasks", task_id, "subtasks_count", 1)
      .await;
    self
      .increment_count_both("todos", todo_id, "tasks_count", 1)
      .await;
  }

  pub async fn on_subtask_completed(&self, task_id: &str, todo_id: &str) {
    self
      .increment_count_both("tasks", task_id, "completed_subtasks_count", 1)
      .await;
    self
      .increment_count_both("todos", todo_id, "completed_tasks_count", 1)
      .await;
  }

  pub async fn on_subtask_deleted(&self, task_id: &str, todo_id: &str, was_completed: bool) {
    self
      .decrement_count_both("tasks", task_id, "subtasks_count", 1)
      .await;
    if was_completed {
      self
        .decrement_count_both("tasks", task_id, "completed_subtasks_count", 1)
        .await;
    }
  }

  pub async fn on_subtask_restored(&self, task_id: &str, todo_id: &str, is_completed: bool) {
    self
      .increment_count_both("tasks", task_id, "subtasks_count", 1)
      .await;
    if is_completed {
      self
        .increment_count_both("tasks", task_id, "completed_subtasks_count", 1)
        .await;
    }
  }

  pub async fn on_comment_created(&self, task_id: Option<&str>, subtask_id: Option<&str>) {
    if let Some(subtask_id) = subtask_id {
      self
        .increment_count_both("subtasks", subtask_id, "comments_count", 1)
        .await;
      if let Some(task_id) = task_id {
        self
          .increment_count_both("tasks", task_id, "comments_count", 1)
          .await;
      }
    } else if let Some(task_id) = task_id {
      self
        .increment_count_both("tasks", task_id, "comments_count", 1)
        .await;
    }
  }

  pub async fn on_comment_deleted(&self, task_id: Option<&str>, subtask_id: Option<&str>) {
    if let Some(subtask_id) = subtask_id {
      self
        .decrement_count_both("subtasks", subtask_id, "comments_count", 1)
        .await;
      if let Some(task_id) = task_id {
        self
          .decrement_count_both("tasks", task_id, "comments_count", 1)
          .await;
      }
    } else if let Some(task_id) = task_id {
      self
        .decrement_count_both("tasks", task_id, "comments_count", 1)
        .await;
    }
  }

  pub async fn on_chat_created(&self, todo_id: &str) {
    self
      .increment_count_both("todos", todo_id, "chats_count", 1)
      .await;
  }

  pub async fn on_chat_deleted(&self, todo_id: &str) {
    self
      .decrement_count_both("todos", todo_id, "chats_count", 1)
      .await;
  }
}
