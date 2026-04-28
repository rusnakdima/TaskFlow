/* sys lib */
use std::collections::HashSet;
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::relations::WithRelations;
use serde_json::{json, Value};

/* entities */
use crate::entities::subtask_entity::SubtaskEntity;
use crate::entities::task_entity::TaskEntity;
use crate::entities::todo_entity::TodoEntity;

/* helpers */
use crate::helpers::response_helper::err_response_formatted;

/* models */
use crate::entities::response_entity::ResponseModel;

#[derive(Default, serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CascadeResult {
  pub todo_count: u64,
  pub task_count: u64,
  pub subtask_count: u64,
  pub comment_count: u64,
  pub chat_count: u64,
}

impl CascadeResult {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn total_count(&self) -> u64 {
    self.todo_count + self.task_count + self.subtask_count + self.comment_count + self.chat_count
  }

  pub fn from_deleted_ids(deleted: &HashSet<String>) -> Self {
    let mut result = Self::new();
    for id in deleted {
      if id.starts_with("todo_") {
        result.todo_count += 1;
      } else if id.starts_with("task_") {
        result.task_count += 1;
      } else if id.starts_with("subtask_") {
        result.subtask_count += 1;
      } else if id.starts_with("comment_") {
        result.comment_count += 1;
      } else if id.starts_with("chat_") {
        result.chat_count += 1;
      }
    }
    result
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

  async fn delete_chats_related_to_todo(&self, todo_id: &str) -> Result<u64, ResponseModel> {
    let filter = nosql_orm::query::Filter::Eq("todo_id".to_string(), json!(todo_id));
    let chats = self
      .json_provider
      .find_many("chats", Some(&filter), None, None, None, false)
      .await
      .map_err(|e| err_response_formatted("Find chats failed", &e.to_string()))?;
    let count = chats.len() as u64;
    for chat in chats {
      if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
        let _ = self.json_provider.delete("chats", chat_id).await;
      }
    }
    Ok(count)
  }

  async fn delete_chats_related_to_todo_mongo(&self, todo_id: &str) -> Result<u64, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    let filter = nosql_orm::query::Filter::Eq("todo_id".to_string(), json!(todo_id));
    let chats = mongo
      .find_many("chats", Some(&filter), None, None, None, false)
      .await
      .map_err(|e| err_response_formatted("Find chats failed", &e.to_string()))?;
    let count = chats.len() as u64;
    for chat in chats {
      if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
        let _ = mongo.delete("chats", chat_id).await;
      }
    }
    Ok(count)
  }

  async fn cascade_delete<P: DatabaseProvider>(
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: Send + Sync,
  {
    let mut deleted = HashSet::new();
    deleted.insert(format!("{}_{}", table, id));

    match table {
      "todos" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<TodoEntity>(id, &TodoEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
        let chat_count = deleted.iter().filter(|s| s.starts_with("chat_")).count() as u64;
        Ok(CascadeResult {
          todo_count: 1,
          task_count: deleted.iter().filter(|s| s.starts_with("task_")).count() as u64,
          subtask_count: deleted.iter().filter(|s| s.starts_with("subtask_")).count() as u64,
          comment_count: deleted.iter().filter(|s| s.starts_with("comment_")).count() as u64,
          chat_count,
        })
      }
      "tasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<TaskEntity>(id, &TaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 1,
          subtask_count: deleted.iter().filter(|s| s.starts_with("subtask_")).count() as u64,
          comment_count: deleted.iter().filter(|s| s.starts_with("comment_")).count() as u64,
          chat_count: 0,
        })
      }
      "subtasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 1,
          comment_count: deleted.iter().filter(|s| s.starts_with("comment_")).count() as u64,
          chat_count: 0,
        })
      }
      "comments" => {
        provider
          .delete("comments", id)
          .await
          .map_err(|e| err_response_formatted("Delete comment failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 0,
          comment_count: 1,
          chat_count: 0,
        })
      }
      _ => Err(err_response_formatted(
        "Unknown table for cascade delete",
        table,
      )),
    }
  }

  async fn cascade_update<P: DatabaseProvider>(
    provider: &P,
    table: &str,
    id: &str,
    patch: Value,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: Send + Sync,
  {
    let filter = nosql_orm::query::Filter::Eq("id".to_string(), json!(id));
    let count = match table {
      "todos" => {
        let tasks = provider
          .find_many("tasks", Some(&filter), None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Find tasks failed", &e.to_string()))?;
        let mut task_count = 0u64;
        let mut subtask_count = 0u64;
        let mut comment_count = 0u64;
        for task in tasks {
          if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
            provider
              .patch("tasks", task_id, patch.clone())
              .await
              .map_err(|e| err_response_formatted("Patch task failed", &e.to_string()))?;
            task_count += 1;

            let sub_filter = nosql_orm::query::Filter::Eq("task_id".to_string(), json!(task_id));
            let subtasks = provider
              .find_many("subtasks", Some(&sub_filter), None, None, None, false)
              .await
              .map_err(|e| err_response_formatted("Find subtasks failed", &e.to_string()))?;
            for subtask in subtasks {
              if let Some(subtask_id) = subtask.get("id").and_then(|v| v.as_str()) {
                provider
                  .patch("subtasks", subtask_id, patch.clone())
                  .await
                  .map_err(|e| err_response_formatted("Patch subtask failed", &e.to_string()))?;
                subtask_count += 1;
              }
            }
            let comments = provider
              .find_many("comments", Some(&sub_filter), None, None, None, false)
              .await
              .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
            for comment in comments {
              if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
                provider
                  .patch("comments", comment_id, patch.clone())
                  .await
                  .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
                comment_count += 1;
              }
            }
          }
        }
        CascadeResult {
          todo_count: 1,
          task_count,
          subtask_count,
          comment_count,
          chat_count: 0,
        }
      }
      "tasks" => {
        let subtasks = provider
          .find_many("subtasks", Some(&filter), None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Find subtasks failed", &e.to_string()))?;
        let mut subtask_count = 0u64;
        let mut comment_count = 0u64;
        for subtask in subtasks {
          if let Some(subtask_id) = subtask.get("id").and_then(|v| v.as_str()) {
            provider
              .patch("subtasks", subtask_id, patch.clone())
              .await
              .map_err(|e| err_response_formatted("Patch subtask failed", &e.to_string()))?;
            subtask_count += 1;
          }
        }
        let comments = provider
          .find_many("comments", Some(&filter), None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
        for comment in comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            provider
              .patch("comments", comment_id, patch.clone())
              .await
              .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
            comment_count += 1;
          }
        }
        CascadeResult {
          todo_count: 0,
          task_count: 1,
          subtask_count,
          comment_count,
          chat_count: 0,
        }
      }
      "subtasks" => {
        let comments = provider
          .find_many("comments", Some(&filter), None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
        let comment_count = comments.len() as u64;
        for comment in comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            provider
              .patch("comments", comment_id, patch.clone())
              .await
              .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
          }
        }
        CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 1,
          comment_count,
          chat_count: 0,
        }
      }
      "comments" => CascadeResult {
        todo_count: 0,
        task_count: 0,
        subtask_count: 0,
        comment_count: 1,
        chat_count: 0,
      },
      _ => {
        return Err(err_response_formatted(
          "Unknown table for cascade update",
          table,
        ))
      }
    };
    Ok(count)
  }

  pub async fn soft_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mut result = Self::cascade_update(
      &self.json_provider,
      table,
      id,
      json!({ "deleted_at": chrono::Utc::now().to_rfc3339() }),
    )
    .await?;
    if table == "todos" {
      result.chat_count = self.delete_chats_related_to_todo(id).await?;
    }
    Ok(result)
  }

  pub async fn soft_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    let mut result = Self::cascade_update(
      mongo.as_ref(),
      table,
      id,
      json!({ "deleted_at": chrono::Utc::now().to_rfc3339() }),
    )
    .await?;
    if table == "todos" {
      result.chat_count = self.delete_chats_related_to_todo_mongo(id).await?;
    }
    Ok(result)
  }

  pub async fn permanent_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mut result = Self::cascade_delete(&self.json_provider, table, id).await?;
    if table == "todos" {
      result.chat_count = self.delete_chats_related_to_todo(id).await?;
    }
    Ok(result)
  }

  pub async fn permanent_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    let mut result = Self::cascade_delete(mongo.as_ref(), table, id).await?;
    if table == "todos" {
      result.chat_count = self.delete_chats_related_to_todo_mongo(id).await?;
    }
    Ok(result)
  }

  pub async fn restore_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.soft_delete_cascade_json(table, id).await
  }

  pub async fn restore_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.soft_delete_cascade_mongo(table, id).await
  }

  pub async fn handle_json_cascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeResult, ResponseModel> {
    let patch = json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });
    let mut result = Self::cascade_update(&self.json_provider, table, id, patch).await?;
    if table == "todos" {
      result.chat_count = self.delete_chats_related_to_todo(id).await?;
    }
    Ok(result)
  }

  pub async fn handle_mongo_cascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    let patch = json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });
    let mut result = Self::cascade_update(mongo.as_ref(), table, id, patch).await?;
    if table == "todos" {
      result.chat_count = self.delete_chats_related_to_todo_mongo(id).await?;
    }
    Ok(result)
  }

  pub async fn sync_entity_to_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.permanent_delete_cascade_json(table, id).await
  }

  pub async fn sync_entity_to_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.permanent_delete_cascade_mongo(table, id).await
  }
}
