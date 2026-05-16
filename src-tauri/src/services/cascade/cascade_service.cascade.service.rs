use std::collections::HashSet;
use std::sync::Arc;

use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::relations::WithRelations;

use crate::entities::comment_entity::CommentEntity;
use crate::entities::response_entity::ResponseModel;
use crate::entities::subtask_entity::SubtaskEntity;
use crate::entities::task_entity::TaskEntity;
use crate::entities::todo_entity::TodoEntity;

use crate::helpers::response_helper::err_response_formatted;
use crate::services::activity_monitor_service::ActivityMonitorService;

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

fn sanitize_for_mongo_replacement(value: serde_json::Value) -> serde_json::Value {
  if let serde_json::Value::Object(obj) = value {
    let mut filtered = serde_json::Map::new();
    for (k, v) in obj.iter() {
      if !k.starts_with('$') {
        filtered.insert(k.clone(), sanitize_for_mongo_replacement(v.clone()));
      }
    }
    serde_json::Value::Object(filtered)
  } else {
    value
  }
}

pub struct CascadeService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub activity_monitor: Option<ActivityMonitorService>,
}

impl Clone for CascadeService {
  fn clone(&self) -> Self {
    CascadeService {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
      activity_monitor: self.activity_monitor.clone(),
    }
  }
}

impl CascadeService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    activity_monitor: Option<ActivityMonitorService>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      activity_monitor,
    }
  }

  pub async fn soft_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self
      .soft_delete_cascade(&self.json_provider, table, id)
      .await
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
    self.soft_delete_cascade(mongo.as_ref(), table, id).await
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
    let mut deleted = HashSet::new();
    deleted.insert(format!("{}_{}", table, id));

    match table {
      "todos" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete_cascade::<TodoEntity>(id, &TodoEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
      }
      "tasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete_cascade::<TaskEntity>(id, &TaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
      }
      "subtasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
      }
      "comments" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete_cascade::<CommentEntity>(id, &CommentEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade soft delete failed", &e.to_string()))?;
      }
      "chats" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete("chats", id)
          .await
          .map_err(|e| err_response_formatted("Soft delete chat failed", &e.to_string()))?;
      }
      "categories" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .soft_delete("categories", id)
          .await
          .map_err(|e| err_response_formatted("Soft delete category failed", &e.to_string()))?;
      }
      _ => {
        return Err(err_response_formatted(
          "Unknown table for cascade soft delete",
          table,
        ));
      }
    }

    if let Some(ref activity_monitor) = self.activity_monitor {
      let empty_value = serde_json::json!({});
      for deleted_id in &deleted {
        if let Some((entity_table, _)) = deleted_id.split_once('_') {
          let _ = activity_monitor
            .log_action(entity_table, "delete", &empty_value, None)
            .await;
        }
      }
    }

    Ok(CascadeResult::from_deleted_ids(&deleted))
  }

  pub async fn restore_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.restore_cascade(&self.json_provider, table, id).await
  }

  pub async fn restore_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
    self.restore_cascade(mongo.as_ref(), table, id).await
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
    let mut restored = HashSet::new();
    restored.insert(format!("{}_{}", table, id));

    match table {
      "todos" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<TodoEntity>(id, &TodoEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;
      }
      "tasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<TaskEntity>(id, &TaskEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;
      }
      "subtasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;
      }
      "comments" => {
        provider
          .patch(
            "comments",
            id,
            serde_json::json!({ "deleted_at": serde_json::Value::Null }),
          )
          .await
          .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
      }
      "chats" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore("chats", id)
          .await
          .map_err(|e| err_response_formatted("Restore chat failed", &e.to_string()))?;
      }
      "categories" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore("categories", id)
          .await
          .map_err(|e| err_response_formatted("Restore category failed", &e.to_string()))?;
      }
      _ => {
        return Err(err_response_formatted(
          "Unknown table for cascade restore",
          table,
        ));
      }
    }

    Ok(CascadeResult::from_deleted_ids(&restored))
  }

  pub async fn permanent_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self
      .permanent_delete_cascade(&self.json_provider, table, id)
      .await
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
    self
      .permanent_delete_cascade(mongo.as_ref(), table, id)
      .await
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
    let mut deleted = HashSet::new();
    deleted.insert(format!("{}_{}", table, id));

    match table {
      "todos" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<TodoEntity>(id, &TodoEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
      }
      "tasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<TaskEntity>(id, &TaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
      }
      "subtasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut deleted)
          .await
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
      }
      "comments" => {
        provider
          .delete("comments", id)
          .await
          .map_err(|e| err_response_formatted("Delete comment failed", &e.to_string()))?;
      }
      "categories" | "chats" | "users" | "profiles" => {
        provider.delete(table, id).await.map_err(|e| {
          err_response_formatted(&format!("Delete {} failed", table), &e.to_string())
        })?;
      }
      _ => {
        return Err(err_response_formatted(
          "Unknown table for cascade delete",
          table,
        ));
      }
    }

    if let Some(ref activity_monitor) = self.activity_monitor {
      let empty_value = serde_json::json!({});
      for deleted_id in &deleted {
        if let Some((entity_table, _)) = deleted_id.split_once('_') {
          let _ = activity_monitor
            .log_action(entity_table, "delete", &empty_value, None)
            .await;
        }
      }
    }

    Ok(CascadeResult::from_deleted_ids(&deleted))
  }

  pub async fn import_todo_cascade_to_json(
    &self,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_json("todos", id).await
  }

  pub async fn export_todo_cascade_to_mongo(
    &self,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_mongo("todos", id).await
  }

  pub async fn sync_entity_to_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let entity = mongo
        .find_by_id(table, id)
        .await
        .map_err(|e| {
          err_response_formatted(
            "Sync to JSON failed",
            &format!("Failed to fetch from Mongo: {}", e),
          )
        })?
        .ok_or_else(|| {
          err_response_formatted(
            "Sync to JSON failed",
            &format!("Entity {} not found in Mongo", id),
          )
        })?;

      let sanitized_entity = sanitize_for_mongo_replacement(entity.clone());

      match self.json_provider.find_by_id(table, id).await {
        Ok(Some(_)) => {
          self
            .json_provider
            .update(table, id, sanitized_entity)
            .await
            .map_err(|e| {
              err_response_formatted(
                "Sync to JSON failed",
                &format!("Failed to update JSON: {}", e),
              )
            })?;
        }
        Ok(None) => {
          self
            .json_provider
            .insert(table, sanitized_entity)
            .await
            .map_err(|e| {
              err_response_formatted(
                "Sync to JSON failed",
                &format!("Failed to insert to JSON: {}", e),
              )
            })?;
        }
        Err(e) => {
          return Err(err_response_formatted(
            "Sync to JSON failed",
            &format!("Failed to check JSON: {}", e),
          ));
        }
      }
    }
    Ok(CascadeResult::new())
  }

  pub async fn sync_entity_to_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let entity = self
        .json_provider
        .find_by_id(table, id)
        .await
        .map_err(|e| {
          err_response_formatted(
            "Cascade sync to MongoDB failed",
            &format!("Failed to fetch from JSON: {}", e),
          )
        })?
        .ok_or_else(|| {
          err_response_formatted(
            "Cascade sync to MongoDB failed",
            &format!("Entity {} not found in JSON", id),
          )
        })?;

      let sanitized_entity = sanitize_for_mongo_replacement(entity.clone());

      match mongo.find_by_id(table, id).await {
        Ok(Some(_)) => {
          mongo
            .update(table, id, sanitized_entity)
            .await
            .map_err(|e| {
              err_response_formatted(
                "Cascade sync to MongoDB failed",
                &format!("Failed to update in MongoDB: {}", e),
              )
            })?;
        }
        Ok(None) => {
          mongo.insert(table, sanitized_entity).await.map_err(|e| {
            err_response_formatted(
              "Cascade sync to MongoDB failed",
              &format!("Failed to insert to MongoDB: {}", e),
            )
          })?;
        }
        Err(e) => {
          return Err(err_response_formatted(
            "Cascade sync to MongoDB failed",
            &format!("Failed to check MongoDB: {}", e),
          ));
        }
      }
    }
    Ok(CascadeResult::new())
  }

  pub async fn backup_todo_to_json(&self, id: &str) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_json("todos", id).await
  }

  pub async fn migrate_todo_to_mongo(&self, id: &str) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_mongo("todos", id).await?;
    self.soft_delete_cascade_json("todos", id).await?;
    Ok(CascadeResult::new())
  }

  pub async fn move_todo_to_json(&self, id: &str) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_json("todos", id).await
  }

  pub async fn sync_entity_to_mongo_and_delete_from_source(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_mongo(table, id).await?;
    self.soft_delete_cascade_json(table, id).await
  }

  pub async fn sync_entity_to_json_keep_source(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_json(table, id).await
  }
}
