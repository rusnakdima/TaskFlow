/* sys lib */
use std::collections::HashSet;
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::relations::WithRelations;
use serde_json::json;

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

  async fn delete_chats_related_to_todo<P>(
    provider: &P,
    todo_id: &str,
  ) -> Result<u64, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    let filter = nosql_orm::query::Filter::Eq("todo_id".to_string(), json!(todo_id));
    let chats = provider
      .find_many("chats", Some(&filter), None, None, None, false)
      .await
      .map_err(|e| err_response_formatted("Find chats failed", &e.to_string()))?;
    let count = chats.len() as u64;
    for chat in chats {
      if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
        let _ = provider.delete("chats", chat_id).await;
      }
    }
    Ok(count)
  }

  async fn cascade_delete<P>(
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
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

  async fn cascade_soft_delete<P>(
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    let mut deleted = HashSet::new();

    match table {
      "todos" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete_cascade::<TodoEntity>(id, &TodoEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
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
          .soft_delete_cascade::<TaskEntity>(id, &TaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
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
          .soft_delete_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 1,
          comment_count: deleted.iter().filter(|s| s.starts_with("comment_")).count() as u64,
          chat_count: 0,
        })
      }
      "comments" => {
        let patch = json!({ "deleted_at": chrono::Utc::now() });
        provider
          .patch("comments", id, patch)
          .await
          .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 0,
          comment_count: 1,
          chat_count: 0,
        })
      }
      "chats" => {
        let patch = json!({ "deleted_at": chrono::Utc::now() });
        provider
          .patch("chats", id, patch)
          .await
          .map_err(|e| err_response_formatted("Patch chat failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 0,
          comment_count: 0,
          chat_count: 1,
        })
      }
      _ => Err(err_response_formatted(
        "Unknown table for cascade soft delete",
        table,
      )),
    }
  }

  async fn cascade_restore<P>(
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    let mut restored = HashSet::new();

    match table {
      "todos" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<TodoEntity>(id, &TodoEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 1,
          task_count: restored.iter().filter(|s| s.starts_with("task_")).count() as u64,
          subtask_count: restored
            .iter()
            .filter(|s| s.starts_with("subtask_"))
            .count() as u64,
          comment_count: restored
            .iter()
            .filter(|s| s.starts_with("comment_"))
            .count() as u64,
          chat_count: 0,
        })
      }
      "tasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<TaskEntity>(id, &TaskEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 1,
          subtask_count: restored
            .iter()
            .filter(|s| s.starts_with("subtask_"))
            .count() as u64,
          comment_count: restored
            .iter()
            .filter(|s| s.starts_with("comment_"))
            .count() as u64,
          chat_count: 0,
        })
      }
      "subtasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 1,
          comment_count: restored
            .iter()
            .filter(|s| s.starts_with("comment_"))
            .count() as u64,
          chat_count: 0,
        })
      }
      "comments" => {
        let patch = json!({ "deleted_at": serde_json::Value::Null });
        provider
          .patch("comments", id, patch)
          .await
          .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 0,
          comment_count: 1,
          chat_count: 0,
        })
      }
      "chats" => {
        let patch = json!({ "deleted_at": serde_json::Value::Null });
        provider
          .patch("chats", id, patch)
          .await
          .map_err(|e| err_response_formatted("Patch chat failed", &e.to_string()))?;
        Ok(CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 0,
          comment_count: 0,
          chat_count: 1,
        })
      }
      _ => Err(err_response_formatted(
        "Unknown table for cascade restore",
        table,
      )),
    }
  }

  // Legacy wrappers for backward compatibility
  #[allow(dead_code)]
  pub async fn soft_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    Self::cascade_soft_delete(&self.json_provider, table, id).await
  }

  #[allow(dead_code)]
  pub async fn soft_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    Self::cascade_soft_delete(mongo.as_ref(), table, id).await
  }

  #[allow(dead_code)]
  pub async fn restore_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    Self::cascade_restore(&self.json_provider, table, id).await
  }

  #[allow(dead_code)]
  pub async fn restore_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    Self::cascade_restore(mongo.as_ref(), table, id).await
  }

  #[allow(dead_code)]
  pub async fn permanent_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mut result = Self::cascade_delete(&self.json_provider, table, id).await?;
    if table == "todos" {
      result.chat_count = Self::delete_chats_related_to_todo(&self.json_provider, id).await?;
    }
    Ok(result)
  }

  #[allow(dead_code)]
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
      result.chat_count = Self::delete_chats_related_to_todo(mongo.as_ref(), id).await?;
    }
    Ok(result)
  }

  #[allow(dead_code)]
  pub async fn handle_json_cascade(
    &self,
    table: &str,
    id: &str,
    is_restore: bool,
  ) -> Result<CascadeResult, ResponseModel> {
    if is_restore {
      self.restore_cascade_json(table, id).await
    } else {
      self.soft_delete_cascade_json(table, id).await
    }
  }

  #[allow(dead_code)]
  pub async fn handle_mongo_cascade(
    &self,
    table: &str,
    id: &str,
    is_restore: bool,
  ) -> Result<CascadeResult, ResponseModel> {
    if is_restore {
      self.restore_cascade_mongo(table, id).await
    } else {
      self.soft_delete_cascade_mongo(table, id).await
    }
  }

  #[allow(dead_code)]
  pub async fn sync_entity_to_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.permanent_delete_cascade_json(table, id).await
  }

  #[allow(dead_code)]
  pub async fn sync_entity_to_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.permanent_delete_cascade_mongo(table, id).await
  }

  #[allow(dead_code)]
  pub async fn import_todo_cascade_to_json(
    &self,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.restore_cascade_json("todos", id).await
  }

  #[allow(dead_code)]
  pub async fn export_todo_cascade_to_mongo(
    &self,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.restore_cascade_mongo("todos", id).await
  }

  pub async fn soft_delete_cascade<P>(
    &self,
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    let mut result = Self::cascade_soft_delete(provider, table, id).await?;
    if table == "todos" {
      result.chat_count = Self::delete_chats_related_to_todo(provider, id).await?;
    }
    Ok(result)
  }

  pub async fn restore_cascade<P>(
    &self,
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    Self::cascade_restore(provider, table, id).await
  }

  pub async fn permanent_delete_cascade<P>(
    &self,
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    let mut result = Self::cascade_delete(provider, table, id).await?;
    if table == "todos" {
      result.chat_count = Self::delete_chats_related_to_todo(provider, id).await?;
    }
    Ok(result)
  }

  #[allow(dead_code)]
  pub async fn sync_entity<P>(
    &self,
    provider: &P,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    self.permanent_delete_cascade(provider, table, id).await
  }

  pub async fn handle_cascade<P>(
    &self,
    provider: &P,
    table: &str,
    id: &str,
    is_restore: bool,
  ) -> Result<CascadeResult, ResponseModel>
  where
    P: DatabaseProvider + Send + Sync,
  {
    if is_restore {
      self.restore_cascade(provider, table, id).await
    } else {
      self.soft_delete_cascade(provider, table, id).await
    }
  }
}
