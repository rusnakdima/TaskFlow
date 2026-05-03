/* sys lib */
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::error::OrmResult;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::json;

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

  pub async fn on_task_created(&self, todo_id: &str) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(mongo.as_ref(), "todos", todo_id, "tasks_count", 1)
        .await;
    }
    let _ = self
      .increment_count(&self.json_provider, "todos", todo_id, "tasks_count", 1)
      .await;
  }

  pub async fn on_task_completed(&self, todo_id: &str) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(mongo.as_ref(), "todos", todo_id, "completed_tasks_count", 1)
        .await;
    }
    let _ = self
      .increment_count(
        &self.json_provider,
        "todos",
        todo_id,
        "completed_tasks_count",
        1,
      )
      .await;
  }

  pub async fn on_task_deleted(&self, todo_id: &str, was_completed: bool) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .decrement_count(mongo.as_ref(), "todos", todo_id, "tasks_count", 1)
        .await;
      if was_completed {
        let _ = self
          .decrement_count(mongo.as_ref(), "todos", todo_id, "completed_tasks_count", 1)
          .await;
      }
    }
    let _ = self
      .decrement_count(&self.json_provider, "todos", todo_id, "tasks_count", 1)
      .await;
    if was_completed {
      let _ = self
        .decrement_count(
          &self.json_provider,
          "todos",
          todo_id,
          "completed_tasks_count",
          1,
        )
        .await;
    }
  }

  pub async fn on_task_restored(&self, todo_id: &str, is_completed: bool) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(mongo.as_ref(), "todos", todo_id, "tasks_count", 1)
        .await;
      if is_completed {
        let _ = self
          .increment_count(mongo.as_ref(), "todos", todo_id, "completed_tasks_count", 1)
          .await;
      }
    }
    let _ = self
      .increment_count(&self.json_provider, "todos", todo_id, "tasks_count", 1)
      .await;
    if is_completed {
      let _ = self
        .increment_count(
          &self.json_provider,
          "todos",
          todo_id,
          "completed_tasks_count",
          1,
        )
        .await;
    }
  }

  pub async fn on_subtask_created(&self, task_id: &str, todo_id: &str) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(mongo.as_ref(), "tasks", task_id, "subtasks_count", 1)
        .await;
      let _ = self
        .increment_count(mongo.as_ref(), "todos", todo_id, "tasks_count", 1)
        .await;
    }
    let _ = self
      .increment_count(&self.json_provider, "tasks", task_id, "subtasks_count", 1)
      .await;
    let _ = self
      .increment_count(&self.json_provider, "todos", todo_id, "tasks_count", 1)
      .await;
  }

  pub async fn on_subtask_completed(&self, task_id: &str, todo_id: &str) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(
          mongo.as_ref(),
          "tasks",
          task_id,
          "completed_subtasks_count",
          1,
        )
        .await;
      let _ = self
        .increment_count(mongo.as_ref(), "todos", todo_id, "completed_tasks_count", 1)
        .await;
    }
    let _ = self
      .increment_count(
        &self.json_provider,
        "tasks",
        task_id,
        "completed_subtasks_count",
        1,
      )
      .await;
    let _ = self
      .increment_count(
        &self.json_provider,
        "todos",
        todo_id,
        "completed_tasks_count",
        1,
      )
      .await;
  }

  pub async fn on_subtask_deleted(&self, task_id: &str, todo_id: &str, was_completed: bool) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .decrement_count(mongo.as_ref(), "tasks", task_id, "subtasks_count", 1)
        .await;
      if was_completed {
        let _ = self
          .decrement_count(
            mongo.as_ref(),
            "tasks",
            task_id,
            "completed_subtasks_count",
            1,
          )
          .await;
      }
    }
    let _ = self
      .decrement_count(&self.json_provider, "tasks", task_id, "subtasks_count", 1)
      .await;
    if was_completed {
      let _ = self
        .decrement_count(
          &self.json_provider,
          "tasks",
          task_id,
          "completed_subtasks_count",
          1,
        )
        .await;
    }
  }

  pub async fn on_subtask_restored(&self, task_id: &str, todo_id: &str, is_completed: bool) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(mongo.as_ref(), "tasks", task_id, "subtasks_count", 1)
        .await;
      if is_completed {
        let _ = self
          .increment_count(
            mongo.as_ref(),
            "tasks",
            task_id,
            "completed_subtasks_count",
            1,
          )
          .await;
      }
    }
    let _ = self
      .increment_count(&self.json_provider, "tasks", task_id, "subtasks_count", 1)
      .await;
    if is_completed {
      let _ = self
        .increment_count(
          &self.json_provider,
          "tasks",
          task_id,
          "completed_subtasks_count",
          1,
        )
        .await;
    }
  }

  pub async fn get_task_id_for_subtask(&self, subtask_id: &str) -> OrmResult<Option<String>> {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Ok(Some(subtask)) = mongo.find_by_id("subtasks", subtask_id).await {
        if let Some(task_id) = subtask.get("task_id").and_then(|v| v.as_str()) {
          return Ok(Some(task_id.to_string()));
        }
      }
    }
    if let Ok(Some(subtask)) = self.json_provider.find_by_id("subtasks", subtask_id).await {
      if let Some(task_id) = subtask.get("task_id").and_then(|v| v.as_str()) {
        return Ok(Some(task_id.to_string()));
      }
    }
    Ok(None)
  }

  pub async fn get_todo_id_for_task(&self, task_id: &str) -> OrmResult<Option<String>> {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Ok(Some(task)) = mongo.find_by_id("tasks", task_id).await {
        if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
          return Ok(Some(todo_id.to_string()));
        }
      }
    }
    if let Ok(Some(task)) = self.json_provider.find_by_id("tasks", task_id).await {
      if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
        return Ok(Some(todo_id.to_string()));
      }
    }
    Ok(None)
  }

  pub async fn on_comment_created(&self, task_id: Option<&str>, subtask_id: Option<&str>) {
    if let Some(subtask_id) = subtask_id {
      if let Ok(Some(task_id)) = self.get_task_id_for_subtask(subtask_id).await {
        if let Some(mongo) = self.mongodb_provider.as_ref() {
          let _ = self
            .increment_count(mongo.as_ref(), "subtasks", subtask_id, "comments_count", 1)
            .await;
          let _ = self
            .increment_count(mongo.as_ref(), "tasks", &task_id, "comments_count", 1)
            .await;
        }
        let _ = self
          .increment_count(
            &self.json_provider,
            "subtasks",
            subtask_id,
            "comments_count",
            1,
          )
          .await;
        let _ = self
          .increment_count(&self.json_provider, "tasks", &task_id, "comments_count", 1)
          .await;
      }
    } else if let Some(task_id) = task_id {
      if let Some(mongo) = self.mongodb_provider.as_ref() {
        let _ = self
          .increment_count(mongo.as_ref(), "tasks", task_id, "comments_count", 1)
          .await;
      }
      let _ = self
        .increment_count(&self.json_provider, "tasks", task_id, "comments_count", 1)
        .await;
    }
  }

  pub async fn on_comment_deleted(&self, task_id: Option<&str>, subtask_id: Option<&str>) {
    if let Some(subtask_id) = subtask_id {
      if let Ok(Some(task_id)) = self.get_task_id_for_subtask(subtask_id).await {
        if let Some(mongo) = self.mongodb_provider.as_ref() {
          let _ = self
            .decrement_count(mongo.as_ref(), "subtasks", subtask_id, "comments_count", 1)
            .await;
          let _ = self
            .decrement_count(mongo.as_ref(), "tasks", &task_id, "comments_count", 1)
            .await;
        }
        let _ = self
          .decrement_count(
            &self.json_provider,
            "subtasks",
            subtask_id,
            "comments_count",
            1,
          )
          .await;
        let _ = self
          .decrement_count(&self.json_provider, "tasks", &task_id, "comments_count", 1)
          .await;
      }
    } else if let Some(task_id) = task_id {
      if let Some(mongo) = self.mongodb_provider.as_ref() {
        let _ = self
          .decrement_count(mongo.as_ref(), "tasks", task_id, "comments_count", 1)
          .await;
      }
      let _ = self
        .decrement_count(&self.json_provider, "tasks", task_id, "comments_count", 1)
        .await;
    }
  }

  pub async fn on_chat_created(&self, todo_id: &str) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .increment_count(mongo.as_ref(), "todos", todo_id, "chats_count", 1)
        .await;
    }
    let _ = self
      .increment_count(&self.json_provider, "todos", todo_id, "chats_count", 1)
      .await;
  }

  pub async fn on_chat_deleted(&self, todo_id: &str) {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let _ = self
        .decrement_count(mongo.as_ref(), "todos", todo_id, "chats_count", 1)
        .await;
    }
    let _ = self
      .decrement_count(&self.json_provider, "todos", todo_id, "chats_count", 1)
      .await;
  }
}
