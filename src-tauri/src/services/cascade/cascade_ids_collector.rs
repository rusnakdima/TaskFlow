use std::sync::Arc;
use nosql_orm::error::OrmResult;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;
use serde_json::Value;
use crate::entities::response_entity::ResponseModel;

#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeIds {
  pub todo_ids: Vec<String>,
  pub task_ids: Vec<String>,
  pub subtask_ids: Vec<String>,
  pub comment_ids: Vec<String>,
  pub chat_ids: Vec<String>,
}

impl CascadeIds {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn is_empty(&self) -> bool {
    self.todo_ids.is_empty()
      && self.task_ids.is_empty()
      && self.subtask_ids.is_empty()
      && self.comment_ids.is_empty()
      && self.chat_ids.is_empty()
  }

  pub fn total_count(&self) -> usize {
    self.todo_ids.len()
      + self.task_ids.len()
      + self.subtask_ids.len()
      + self.comment_ids.len()
      + self.chat_ids.len()
  }

  pub fn add_id(&mut self, collection: &str, id: String) {
    match collection {
      "todos" => {
        if !self.todo_ids.contains(&id) {
          self.todo_ids.push(id);
        }
      }
      "tasks" => {
        if !self.task_ids.contains(&id) {
          self.task_ids.push(id);
        }
      }
      "subtasks" => {
        if !self.subtask_ids.contains(&id) {
          self.subtask_ids.push(id);
        }
      }
      "comments" => {
        if !self.comment_ids.contains(&id) {
          self.comment_ids.push(id);
        }
      }
      "chats" => {
        if !self.chat_ids.contains(&id) {
          self.chat_ids.push(id);
        }
      }
      _ => {}
    }
  }
}

pub struct CascadeIdsCollector {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl CascadeIdsCollector {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn collect_cascade_ids_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let mut cascade_ids = CascadeIds::default();

    match table {
      "todos" => {
        cascade_ids.add_id("todos", id.to_string());
        let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(id));
        if let Ok(tasks) = self
          .json_provider
          .find_many("tasks", Some(&filter), None, None, None, true)
          .await
        {
          for task in tasks {
            if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
              cascade_ids.add_id("tasks", task_id.to_string());
              self.collect_subtasks_json(task_id, &mut cascade_ids).await;
              self
                .collect_comments_by_task_json(task_id, &mut cascade_ids)
                .await;
            }
          }
        }
        self.collect_chats_by_todo_json(id, &mut cascade_ids).await;
      }
      "tasks" => {
        cascade_ids.add_id("tasks", id.to_string());
        self.collect_subtasks_json(id, &mut cascade_ids).await;
        self
          .collect_comments_by_task_json(id, &mut cascade_ids)
          .await;
      }
      "subtasks" => {
        cascade_ids.add_id("subtasks", id.to_string());
        self
          .collect_comments_by_subtask_json(id, &mut cascade_ids)
          .await;
      }
      "comments" => {
        cascade_ids.add_id("comments", id.to_string());
      }
      _ => {}
    }

    Ok(cascade_ids)
  }

  pub async fn collect_comments_by_task_json(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
    if let Ok(comments) = self
      .json_provider
      .find_many("comments", Some(&filter), None, None, None, true)
      .await
    {
      for comment in comments {
        if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
          cascade_ids.add_id("comments", comment_id.to_string());
        }
      }
    }
  }

  pub async fn collect_comments_by_subtask_json(&self, subtask_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("subtask_id".to_string(), serde_json::json!(subtask_id));
    if let Ok(comments) = self
      .json_provider
      .find_many("comments", Some(&filter), None, None, None, true)
      .await
    {
      for comment in comments {
        if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
          cascade_ids.add_id("comments", comment_id.to_string());
        }
      }
    }
  }

  pub async fn collect_chats_by_todo_json(&self, todo_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id));
    if let Ok(chats) = self
      .json_provider
      .find_many("chats", Some(&filter), None, None, None, true)
      .await
    {
      for chat in chats {
        if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
          cascade_ids.add_id("chats", chat_id.to_string());
        }
      }
    }
  }

  pub async fn collect_subtasks_json(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
    let result: OrmResult<Vec<Value>> = self
      .json_provider
      .find_many("subtasks", Some(&filter), None, None, None, true)
      .await;
    if let Ok(subtasks) = result {
      for subtask in subtasks {
        let sid = subtask.get("id").and_then(|v| v.as_str()).map(String::from);
        if let Some(subtask_id) = sid {
          cascade_ids.add_id("subtasks", subtask_id);
        }
      }
    }
  }

  pub async fn collect_cascade_ids_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let mut cascade_ids = CascadeIds::default();

    if let Some(ref mongo) = self.mongodb_provider {
      match table {
        "todos" => {
          cascade_ids.add_id("todos", id.to_string());
          let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(id));
          if let Ok(tasks) = mongo
            .find_many("tasks", Some(&filter), None, None, None, true)
            .await
          {
            for task in tasks {
              if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
                cascade_ids.add_id("tasks", task_id.to_string());
                self.collect_subtasks_mongo(task_id, &mut cascade_ids).await;
                self
                  .collect_comments_by_task_mongo(task_id, &mut cascade_ids)
                  .await;
              }
            }
          }
          self.collect_chats_by_todo_mongo(id, &mut cascade_ids).await;
        }
        "tasks" => {
          cascade_ids.add_id("tasks", id.to_string());
          self.collect_subtasks_mongo(id, &mut cascade_ids).await;
          self
            .collect_comments_by_task_mongo(id, &mut cascade_ids)
            .await;
        }
        "subtasks" => {
          cascade_ids.add_id("subtasks", id.to_string());
          self
            .collect_comments_by_subtask_mongo(id, &mut cascade_ids)
            .await;
        }
        "comments" => {
          cascade_ids.add_id("comments", id.to_string());
        }
        _ => {}
      }
    }

    Ok(cascade_ids)
  }

  pub async fn collect_comments_by_task_mongo(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
      if let Ok(comments) = mongo
        .find_many("comments", Some(&filter), None, None, None, true)
        .await
      {
        for comment in comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            cascade_ids.add_id("comments", comment_id.to_string());
          }
        }
      }
    }
  }

  pub async fn collect_comments_by_subtask_mongo(
    &self,
    subtask_id: &str,
    cascade_ids: &mut CascadeIds,
  ) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("subtask_id".to_string(), serde_json::json!(subtask_id));
      if let Ok(comments) = mongo
        .find_many("comments", Some(&filter), None, None, None, true)
        .await
      {
        for comment in comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            cascade_ids.add_id("comments", comment_id.to_string());
          }
        }
      }
    }
  }

  pub async fn collect_chats_by_todo_mongo(&self, todo_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id));
      if let Ok(chats) = mongo
        .find_many("chats", Some(&filter), None, None, None, true)
        .await
      {
        for chat in chats {
          if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
            cascade_ids.add_id("chats", chat_id.to_string());
          }
        }
      }
    }
  }

  pub async fn collect_subtasks_mongo(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
      let result: OrmResult<Vec<Value>> = mongo
        .find_many("subtasks", Some(&filter), None, None, None, true)
        .await;
      if let Ok(subtasks) = result {
        for subtask in subtasks {
          let sid = subtask.get("id").and_then(|v| v.as_str()).map(String::from);
          if let Some(subtask_id) = sid {
            cascade_ids.add_id("subtasks", subtask_id);
          }
        }
      }
    }
  }
}