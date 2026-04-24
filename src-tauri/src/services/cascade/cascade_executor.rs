use std::sync::Arc;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;
use serde_json::Value;
use crate::entities::response_entity::ResponseModel;
use super::cascade_ids_collector::CascadeIds;

pub struct CascadeExecutor {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl CascadeExecutor {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn execute_cascade_delete_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<(), ResponseModel> {
    for id in &cascade_ids.todo_ids {
      let _ = self.json_provider.delete("todos", id).await;
    }
    for id in &cascade_ids.task_ids {
      let _ = self.json_provider.delete("tasks", id).await;
    }
    for id in &cascade_ids.subtask_ids {
      let _ = self.json_provider.delete("subtasks", id).await;
    }
    for id in &cascade_ids.comment_ids {
      let _ = self.json_provider.delete("comments", id).await;
    }
    for id in &cascade_ids.chat_ids {
      let _ = self.json_provider.delete("chats", id).await;
    }
    Ok(())
  }

  pub async fn execute_cascade_delete_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<(), ResponseModel> {
    if let Some(ref mongo) = self.mongodb_provider {
      for id in &cascade_ids.todo_ids {
        let _ = mongo.delete("todos", id).await;
      }
      for id in &cascade_ids.task_ids {
        let _ = mongo.delete("tasks", id).await;
      }
      for id in &cascade_ids.subtask_ids {
        let _ = mongo.delete("subtasks", id).await;
      }
      for id in &cascade_ids.comment_ids {
        let _ = mongo.delete("comments", id).await;
      }
      for id in &cascade_ids.chat_ids {
        let _ = mongo.delete("chats", id).await;
      }
    }
    Ok(())
  }

  pub async fn execute_cascade_soft_delete_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
    patch: Value,
  ) -> Result<(), ResponseModel> {
    for id in &cascade_ids.todo_ids {
      let _ = self.json_provider.patch("todos", id, patch.clone()).await;
    }
    for id in &cascade_ids.task_ids {
      let _ = self.json_provider.patch("tasks", id, patch.clone()).await;
    }
    for id in &cascade_ids.subtask_ids {
      let _ = self
        .json_provider
        .patch("subtasks", id, patch.clone())
        .await;
    }
    for id in &cascade_ids.comment_ids {
      let _ = self
        .json_provider
        .patch("comments", id, patch.clone())
        .await;
    }
    for id in &cascade_ids.chat_ids {
      let _ = self.json_provider.patch("chats", id, patch.clone()).await;
    }
    Ok(())
  }

  pub async fn execute_cascade_soft_delete_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
    patch: Value,
  ) -> Result<(), ResponseModel> {
    if let Some(ref mongo) = self.mongodb_provider {
      for id in &cascade_ids.todo_ids {
        let _ = mongo.patch("todos", id, patch.clone()).await;
      }
      for id in &cascade_ids.task_ids {
        let _ = mongo.patch("tasks", id, patch.clone()).await;
      }
      for id in &cascade_ids.subtask_ids {
        let _ = mongo.patch("subtasks", id, patch.clone()).await;
      }
      for id in &cascade_ids.comment_ids {
        let _ = mongo.patch("comments", id, patch.clone()).await;
      }
      for id in &cascade_ids.chat_ids {
        let _ = mongo.patch("chats", id, patch.clone()).await;
      }
    }
    Ok(())
  }

  pub async fn fetch_cascade_docs_json(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<Vec<Value>, ResponseModel> {
    let mut docs = Vec::new();

    if !cascade_ids.todo_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .todo_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(todos) = self
        .json_provider
        .find_many("todos", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(todos);
      }
    }

    if !cascade_ids.task_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .task_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(tasks) = self
        .json_provider
        .find_many("tasks", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(tasks);
      }
    }

    if !cascade_ids.subtask_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .subtask_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(subtasks) = self
        .json_provider
        .find_many("subtasks", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(subtasks);
      }
    }

    if !cascade_ids.comment_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .comment_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(comments) = self
        .json_provider
        .find_many("comments", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(comments);
      }
    }

    if !cascade_ids.chat_ids.is_empty() {
      let filter = Filter::In(
        "id".to_string(),
        cascade_ids
          .chat_ids
          .iter()
          .map(|id| serde_json::json!(id))
          .collect(),
      );
      if let Ok(chats) = self
        .json_provider
        .find_many("chats", Some(&filter), None, None, None, false)
        .await
      {
        docs.extend(chats);
      }
    }

    Ok(docs)
  }

  pub async fn fetch_cascade_docs_mongo(
    &self,
    _table: &str,
    cascade_ids: &CascadeIds,
  ) -> Result<Vec<Value>, ResponseModel> {
    let mut docs = Vec::new();

    if let Some(ref mongo) = self.mongodb_provider {
      if !cascade_ids.todo_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .todo_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(todos) = mongo
          .find_many("todos", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(todos);
        }
      }

      if !cascade_ids.task_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .task_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(tasks) = mongo
          .find_many("tasks", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(tasks);
        }
      }

      if !cascade_ids.subtask_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .subtask_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(subtasks) = mongo
          .find_many("subtasks", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(subtasks);
        }
      }

      if !cascade_ids.comment_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .comment_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(comments) = mongo
          .find_many("comments", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(comments);
        }
      }

      if !cascade_ids.chat_ids.is_empty() {
        let filter = Filter::In(
          "id".to_string(),
          cascade_ids
            .chat_ids
            .iter()
            .map(|id| serde_json::json!(id))
            .collect(),
        );
        if let Ok(chats) = mongo
          .find_many("chats", Some(&filter), None, None, None, false)
          .await
        {
          docs.extend(chats);
        }
      }
    }

    Ok(docs)
  }
}