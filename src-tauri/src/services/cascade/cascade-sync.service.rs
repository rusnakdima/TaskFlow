use std::collections::HashSet;
use std::sync::Arc;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use crate::models::response::ResponseModel;
use crate::utils::response_helper::err_response_formatted;
use super::{CascadeResult, CascadeService};
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
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;
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
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
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
          .map_err(|e| err_response_formatted("Cascade delete failed", &e.to_string()))?;
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