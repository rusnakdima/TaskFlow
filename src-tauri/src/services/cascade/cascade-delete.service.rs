use std::collections::HashSet;
use std::sync::Arc;

use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::relations::WithRelations;

use crate::entities::comment_entity::CommentEntity;
use crate::models::response::ResponseModel;
use crate::entities::subtask_entity::SubtaskEntity;
use crate::entities::task_entity::TaskEntity;
use crate::entities::todo_entity::TodoEntity;

use crate::utils::response_helper::err_response_formatted;
use crate::services::activity_monitor_service::ActivityMonitorService;

use super::{CascadeResult, CascadeService};

impl CascadeService {
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
        let _ = cascade.soft_delete("chats", id).await;
      }
      "categories" => {
        let cascade = CascadeManager::new(provider.clone());
        let _ = cascade.soft_delete("categories", id).await;
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
    let mut affected_todo_ids: Vec<String> = Vec::new();

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

        if let Some(task) = provider.find_by_id("tasks", id).await? {
          if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
            affected_todo_ids.push(todo_id.to_string());
          }
        }
      }
      "subtasks" => {
        let cascade = CascadeManager::new(provider.clone());
        cascade
          .restore_cascade::<SubtaskEntity>(id, &SubtaskEntity::relations(), &mut restored)
          .await
          .map_err(|e| err_response_formatted("Cascade restore failed", &e.to_string()))?;

        if let Some(subtask) = provider.find_by_id("subtasks", id).await? {
          if let Some(task_id) = subtask.get("task_id").and_then(|v| v.as_str()) {
            if let Some(task) = provider.find_by_id("tasks", task_id).await? {
              if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
                affected_todo_ids.push(todo_id.to_string());
              }
            }
          }
        }
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
        let _ = cascade.restore("chats", id).await;
      }
      "categories" => {
        let cascade = CascadeManager::new(provider.clone());
        let _ = cascade.restore("categories", id).await;
      }
      _ => {
        return Err(err_response_formatted(
          "Unknown table for cascade restore",
          table,
        ));
      }
    }

    let mut result = CascadeResult::from_deleted_ids(&restored);
    result.affected_todo_ids = affected_todo_ids;
    result.restored_ids = restored.into_iter().collect();

    Ok(result)
  }
}