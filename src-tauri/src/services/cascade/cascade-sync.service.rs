use std::collections::HashSet;
use std::sync::Arc;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use crate::task_response::ResponseModel;
use tauri_shared::response::Response;
use tauri_shared::algorithms::sanitization::sanitize_for_mongo;

use super::{CascadeResult, CascadeService};

impl CascadeService {
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
      .ok_or_else(|| Response::error("MongoDB not available"))?;
    self
      .permanent_delete_cascade(mongo.as_ref(), table, id)
      .await
  }
  pub async fn cleanup_non_private_from_json(&self) -> Result<CascadeResult, ResponseModel> {
    let mut result = CascadeResult::new();
    let filter =
      nosql_orm::query::Filter::Ne("visibility".to_string(), serde_json::json!("private"));
    let non_private_todos = self
      .json_provider
      .find_many("todos", Some(&filter), None, None, None, true)
      .await
      .unwrap_or_default();
    for todo in &non_private_todos {
      if let Some(todo_id) = todo.get("id").and_then(|v| v.as_str()) {
        let delete_result = self.permanent_delete_cascade_json("todos", todo_id).await;
        if delete_result.is_ok() {
          result.todo_count += 1;
        }
      }
    }
    Ok(result)
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
        let cascade = nosql_orm::cascade::CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<crate::entities::todo_entity::TodoEntity>(
            id,
            &crate::entities::todo_entity::TodoEntity::relations(),
            &mut deleted,
          )
          .await
          .map_err(|e| Response::error(format!("Cascade delete failed: {}", e)))?;
      }
      "tasks" => {
        let cascade = nosql_orm::cascade::CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<crate::entities::task_entity::TaskEntity>(
            id,
            &crate::entities::task_entity::TaskEntity::relations(),
            &mut deleted,
          )
          .await
          .map_err(|e| Response::error(format!("Cascade delete failed: {}", e)))?;
      }
      "subtasks" => {
        let cascade = nosql_orm::cascade::CascadeManager::new(provider.clone());
        cascade
          .hard_delete_cascade::<crate::entities::subtask_entity::SubtaskEntity>(
            id,
            &crate::entities::subtask_entity::SubtaskEntity::relations(),
            &mut deleted,
          )
          .await
          .map_err(|e| Response::error(format!("Cascade delete failed: {}", e)))?;
      }
      "comments" => {
        provider
          .delete("comments", id)
          .await
          .map_err(|e| Response::error(format!("Delete comment failed: {}", e)))?;
      }
      "categories" | "chats" | "users" | "profiles" => {
        provider.delete(table, id).await.map_err(|e| {
          Response::error(format!("Delete {} failed", table))
        })?;
      }
      _ => {
        return Err(Response::error(&format!("Unknown table for cascade delete: {}", table)));
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
    if table == "todos" {
      if let Some(mongo) = self.mongodb_provider.as_ref() {
        if let Ok(Some(entity)) = mongo.find_by_id(table, id).await {
          if let Some(visibility) = entity.get("visibility").and_then(|v| v.as_str()) {
            if visibility != "private" {
              return Ok(CascadeResult::new());
            }
          }
        }
      }
    }
    if let Some(mongo) = self.mongodb_provider.as_ref() {
      let entity = mongo
        .find_by_id(table, id)
        .await
        .map_err(|e| {
          Response::error(&format!("Sync to JSON failed: Failed to fetch from Mongo: {}", e))
        })?
        .ok_or_else(|| {
          Response::error(&format!("Sync to JSON failed: Entity {} not found in Mongo", id))
        })?;
      let mut sanitized_entity = entity.clone();
      sanitize_for_mongo(&mut sanitized_entity);
      match self.json_provider.find_by_id(table, id).await {
        Ok(Some(_)) => {
          self
            .json_provider
            .update(table, id, sanitized_entity)
            .await
            .map_err(|e| {
              Response::error(&format!("Sync to JSON failed: Failed to update JSON: {}", e))
            })?;
        }
        Ok(None) => {
          self
            .json_provider
            .insert(table, sanitized_entity)
            .await
            .map_err(|e| {
              Response::error(&format!("Sync to JSON failed: Failed to insert to JSON: {}", e))
            })?;
        }
        Err(e) => {
          return Err(Response::error(&format!("Sync to JSON failed: Failed to check JSON: {}", e)));
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
          Response::error(&format!("Cascade sync to MongoDB failed: Failed to fetch from JSON: {}", e))
        })?
        .ok_or_else(|| {
          Response::error(&format!("Cascade sync to MongoDB failed: Entity {} not found in JSON", id))
        })?;
      let mut sanitized_entity = entity.clone();
      sanitize_for_mongo(&mut sanitized_entity);
      match mongo.find_by_id(table, id).await {
        Ok(Some(_)) => {
          mongo
            .update(table, id, sanitized_entity)
            .await
            .map_err(|e| {
              Response::error(&format!("Cascade sync to MongoDB failed: Failed to update in MongoDB: {}", e))
            })?;
        }
        Ok(None) => {
          mongo.insert(table, sanitized_entity).await.map_err(|e| {
            Response::error(&format!("Cascade sync to MongoDB failed: Failed to insert to MongoDB: {}", e))
          })?;
        }
        Err(e) => {
          return Err(Response::error(&format!("Cascade sync to MongoDB failed: Failed to check MongoDB: {}", e)));
        }
      }
    }
    Ok(CascadeResult::new())
  }
  pub async fn backup_todo_to_json(&self, id: &str) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_json("todos", id).await
  }
  pub async fn migrate_todo_to_mongo(&self, id: &str) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_mongo("todos", id).await
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
  pub async fn sync_entity_to_json_and_delete_from_source(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    self.sync_entity_to_json(table, id).await?;
    self.soft_delete_cascade_mongo(table, id).await
  }
}