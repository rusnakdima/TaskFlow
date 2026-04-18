/* sys lib */
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;
use nosql_orm::error::OrmResult;
use serde_json::Value;

/* helpers */
use crate::helpers::response_helper::errResponseFormatted;

/* models */
use crate::entities::response_entity::ResponseModel;

#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeIds {
  pub todoIds: Vec<String>,
  pub taskIds: Vec<String>,
  pub subtaskIds: Vec<String>,
  pub commentIds: Vec<String>,
  pub chatIds: Vec<String>,
}

impl CascadeIds {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn is_empty(&self) -> bool {
    self.todoIds.is_empty()
      && self.taskIds.is_empty()
      && self.subtaskIds.is_empty()
      && self.commentIds.is_empty()
      && self.chatIds.is_empty()
  }

  pub fn total_count(&self) -> usize {
    self.todoIds.len() + self.taskIds.len() + self.subtaskIds.len() + self.commentIds.len() + self.chatIds.len()
  }

  pub fn add_id(&mut self, collection: &str, id: String) {
    match collection {
      "todos" => {
        if !self.todoIds.contains(&id) {
          self.todoIds.push(id);
        }
      }
      "tasks" => {
        if !self.taskIds.contains(&id) {
          self.taskIds.push(id);
        }
      }
      "subtasks" => {
        if !self.subtaskIds.contains(&id) {
          self.subtaskIds.push(id);
        }
      }
      "comments" => {
        if !self.commentIds.contains(&id) {
          self.commentIds.push(id);
        }
      }
      "chats" => {
        if !self.chatIds.contains(&id) {
          self.chatIds.push(id);
        }
      }
      _ => {}
    }
  }

  pub fn add_todo_id(&mut self, id: String) {
    if !self.todoIds.contains(&id) {
      self.todoIds.push(id);
    }
  }

  pub fn add_task_id(&mut self, id: String) {
    if !self.taskIds.contains(&id) {
      self.taskIds.push(id);
    }
  }

  pub fn add_subtask_id(&mut self, id: String) {
    if !self.subtaskIds.contains(&id) {
      self.subtaskIds.push(id);
    }
  }

  pub fn add_comment_id(&mut self, id: String) {
    if !self.commentIds.contains(&id) {
      self.commentIds.push(id);
    }
  }

  pub fn add_chat_id(&mut self, id: String) {
    if !self.chatIds.contains(&id) {
      self.chatIds.push(id);
    }
  }
}

pub struct CascadeService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

impl Clone for CascadeService {
  fn clone(&self) -> Self {
    CascadeService {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
    }
  }
}

impl CascadeService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  async fn collect_cascade_ids_json(&self, table: &str, id: &str) -> Result<CascadeIds, ResponseModel> {
    let mut cascade_ids = CascadeIds::default();

    match table {
      "todos" => {
        cascade_ids.add_todo_id(id.to_string());
        let filter = Filter::Eq("todoId".to_string(), serde_json::json!(id));
        if let Ok(tasks) = self.json_provider
          .find_many("tasks", Some(&filter), None, None, None, true)
          .await
        {
          for task in tasks {
            if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
              cascade_ids.add_task_id(task_id.to_string());
              self.collect_subtasks_json(task_id, &mut cascade_ids).await;
            }
          }
        }
      }
      "tasks" => {
        cascade_ids.add_task_id(id.to_string());
        self.collect_subtasks_json(id, &mut cascade_ids).await;
      }
      "subtasks" => {
        cascade_ids.add_subtask_id(id.to_string());
      }
      "comments" => {
        cascade_ids.add_comment_id(id.to_string());
      }
      _ => {}
    }

    Ok(cascade_ids)
  }

  async fn collect_subtasks_json(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    let filter = Filter::Eq("taskId".to_string(), serde_json::json!(task_id));
    let result: OrmResult<Vec<Value>> = self.json_provider
      .find_many("subtasks", Some(&filter), None, None, None, true)
      .await;
    if let Ok(subtasks) = result {
      for subtask in subtasks {
        let sid = subtask.get("id").and_then(|v| v.as_str()).map(String::from);
        if let Some(subtask_id) = sid {
          cascade_ids.add_subtask_id(subtask_id);
        }
      }
    }
  }

  async fn collect_cascade_ids_mongo(&self, table: &str, id: &str) -> Result<CascadeIds, ResponseModel> {
    let mut cascade_ids = CascadeIds::default();

    if let Some(ref mongo) = self.mongodb_provider {
      match table {
        "todos" => {
          cascade_ids.add_todo_id(id.to_string());
          let filter = Filter::Eq("todoId".to_string(), serde_json::json!(id));
          if let Ok(tasks) = mongo.find_many("tasks", Some(&filter), None, None, None, true).await {
            for task in tasks {
              if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
                cascade_ids.add_task_id(task_id.to_string());
                self.collect_subtasks_mongo(task_id, &mut cascade_ids).await;
              }
            }
          }
        }
        "tasks" => {
          cascade_ids.add_task_id(id.to_string());
          self.collect_subtasks_mongo(id, &mut cascade_ids).await;
        }
        "subtasks" => {
          cascade_ids.add_subtask_id(id.to_string());
        }
        "comments" => {
          cascade_ids.add_comment_id(id.to_string());
        }
        _ => {}
      }
    }

    Ok(cascade_ids)
  }

  async fn collect_subtasks_mongo(&self, task_id: &str, cascade_ids: &mut CascadeIds) {
    if let Some(ref mongo) = self.mongodb_provider {
      let filter = Filter::Eq("taskId".to_string(), serde_json::json!(task_id));
      let result: OrmResult<Vec<Value>> = mongo.find_many("subtasks", Some(&filter), None, None, None, true).await;
      if let Ok(subtasks) = result {
        for subtask in subtasks {
          let sid = subtask.get("id").and_then(|v| v.as_str()).map(String::from);
          if let Some(subtask_id) = sid {
            cascade_ids.add_subtask_id(subtask_id);
          }
        }
      }
    }
  }

  pub async fn handleJsonCascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    self.collect_cascade_ids_json(table, id).await
  }

  pub async fn handleMongoCascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if self.mongodb_provider.is_none() {
      return Err(errResponseFormatted("MongoDB not available", ""));
    }
    self.collect_cascade_ids_mongo(table, id).await
  }
}