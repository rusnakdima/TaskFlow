/* sys lib */
use std::collections::HashSet;
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::relations::WithRelations;
use nosql_orm::soft_delete::SoftDeletable;
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
    let count = match table {
      "todos" => {
        let todo_filter = nosql_orm::query::Filter::Eq("todo_id".to_string(), json!(id));
        let tasks = provider
          .find_many("tasks", Some(&todo_filter), None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Find tasks failed", &e.to_string()))?;
        let task_count = tasks.len() as u64;
        let task_ids: Vec<String> = tasks
          .iter()
          .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
          .collect();

        if !task_ids.is_empty() {
          let task_ids_filter = nosql_orm::query::Filter::In(
            "id".to_string(),
            task_ids.iter().map(|id| json!(id)).collect(),
          );
          provider
            .update_many("tasks", Some(task_ids_filter), patch.clone())
            .await
            .map_err(|e| err_response_formatted("Update tasks failed", &e.to_string()))?;

          let task_ids_for_subtasks = nosql_orm::query::Filter::In(
            "task_id".to_string(),
            task_ids.iter().map(|id| json!(id)).collect(),
          );
          let subtasks = provider
            .find_many(
              "subtasks",
              Some(&task_ids_for_subtasks),
              None,
              None,
              None,
              false,
            )
            .await
            .map_err(|e| err_response_formatted("Find subtasks failed", &e.to_string()))?;
          let subtask_count = subtasks.len() as u64;

          let subtask_ids: Vec<String> = subtasks
            .iter()
            .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
            .collect();

          if !subtask_ids.is_empty() {
            let subtask_ids_filter = nosql_orm::query::Filter::In(
              "subtask_id".to_string(),
              subtask_ids.iter().map(|id| json!(id)).collect(),
            );
            provider
              .update_many("subtasks", Some(subtask_ids_filter), patch.clone())
              .await
              .map_err(|e| err_response_formatted("Update subtasks failed", &e.to_string()))?;

            let comment_filter = nosql_orm::query::Filter::In(
              "subtask_id".to_string(),
              subtask_ids.iter().map(|id| json!(id)).collect(),
            );
            let comments = provider
              .find_many("comments", Some(&comment_filter), None, None, None, false)
              .await
              .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
            let comment_count = comments.len() as u64;

            if !subtask_ids.is_empty() {
              provider
                .update_many(
                  "comments",
                  Some(nosql_orm::query::Filter::In(
                    "subtask_id".to_string(),
                    subtask_ids.iter().map(|id| json!(id)).collect(),
                  )),
                  patch.clone(),
                )
                .await
                .map_err(|e| err_response_formatted("Update comments failed", &e.to_string()))?;
            }

            CascadeResult {
              todo_count: 1,
              task_count,
              subtask_count,
              comment_count,
              chat_count: 0,
            }
          } else {
            CascadeResult {
              todo_count: 1,
              task_count,
              subtask_count: 0,
              comment_count: 0,
              chat_count: 0,
            }
          }
        } else {
          CascadeResult {
            todo_count: 1,
            task_count: 0,
            subtask_count: 0,
            comment_count: 0,
            chat_count: 0,
          }
        }
      }
      "tasks" => {
        let task_filter = nosql_orm::query::Filter::Eq("id".to_string(), json!(id));
        let subtasks = provider
          .find_many(
            "subtasks",
            Some(&task_filter.clone()),
            None,
            None,
            None,
            false,
          )
          .await
          .map_err(|e| err_response_formatted("Find subtasks failed", &e.to_string()))?;
        let subtask_count = subtasks.len() as u64;

        let subtask_ids: Vec<String> = subtasks
          .iter()
          .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
          .collect();

        if !subtask_ids.is_empty() {
          let subtask_ids_filter = nosql_orm::query::Filter::In(
            "id".to_string(),
            subtask_ids.iter().map(|id| json!(id)).collect(),
          );
          provider
            .update_many("subtasks", Some(subtask_ids_filter), patch.clone())
            .await
            .map_err(|e| err_response_formatted("Update subtasks failed", &e.to_string()))?;

          let subtask_ids_for_comments = nosql_orm::query::Filter::In(
            "subtask_id".to_string(),
            subtask_ids.iter().map(|id| json!(id)).collect(),
          );
          let comments = provider
            .find_many(
              "comments",
              Some(&subtask_ids_for_comments),
              None,
              None,
              None,
              false,
            )
            .await
            .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
          let comment_count = comments.len() as u64;

          if !subtask_ids.is_empty() {
            provider
              .update_many(
                "comments",
                Some(nosql_orm::query::Filter::In(
                  "subtask_id".to_string(),
                  subtask_ids.iter().map(|id| json!(id)).collect(),
                )),
                patch.clone(),
              )
              .await
              .map_err(|e| err_response_formatted("Update comments failed", &e.to_string()))?;
          }

          CascadeResult {
            todo_count: 0,
            task_count: 1,
            subtask_count,
            comment_count,
            chat_count: 0,
          }
        } else {
          let comments = provider
            .find_many("comments", Some(&task_filter), None, None, None, false)
            .await
            .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
          let comment_count = comments.len() as u64;

          if comment_count > 0 {
            let comment_filter = nosql_orm::query::Filter::In(
              "id".to_string(),
              comments
                .iter()
                .filter_map(|c| c.get("id").and_then(|v| v.as_str()).map(String::from))
                .map(|id| json!(id))
                .collect(),
            );
            provider
              .update_many("comments", Some(comment_filter), patch.clone())
              .await
              .map_err(|e| err_response_formatted("Update comments failed", &e.to_string()))?;
          }

          CascadeResult {
            todo_count: 0,
            task_count: 1,
            subtask_count: 0,
            comment_count,
            chat_count: 0,
          }
        }
      }
      "subtasks" => {
        let _subtask_filter = nosql_orm::query::Filter::Eq("id".to_string(), json!(id));
        provider
          .patch("subtasks", id, patch.clone())
          .await
          .map_err(|e| err_response_formatted("Patch subtask failed", &e.to_string()))?;

        let subtask_id_filter = nosql_orm::query::Filter::Eq("subtask_id".to_string(), json!(id));
        let comments = provider
          .find_many(
            "comments",
            Some(&subtask_id_filter),
            None,
            None,
            None,
            false,
          )
          .await
          .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
        let comment_count = comments.len() as u64;

        if comment_count > 0 {
          let comment_filter = nosql_orm::query::Filter::In(
            "id".to_string(),
            comments
              .iter()
              .filter_map(|c| c.get("id").and_then(|v| v.as_str()).map(String::from))
              .map(|id| json!(id))
              .collect(),
          );
          provider
            .update_many("comments", Some(comment_filter), patch.clone())
            .await
            .map_err(|e| err_response_formatted("Update comments failed", &e.to_string()))?;
        }

        CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 1,
          comment_count,
          chat_count: 0,
        }
      }
      "comments" => {
        provider
          .patch("comments", id, patch.clone())
          .await
          .map_err(|e| err_response_formatted("Patch comment failed", &e.to_string()))?;
        CascadeResult {
          todo_count: 0,
          task_count: 0,
          subtask_count: 0,
          comment_count: 1,
          chat_count: 0,
        }
      }
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
    let patch = serde_json::json!({ "deleted_at": chrono::Utc::now() });
    let mut result = Self::cascade_update(&self.json_provider, table, id, patch).await?;
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
    let patch = serde_json::json!({ "deleted_at": chrono::Utc::now() });
    let mut result = Self::cascade_update(mongo.as_ref(), table, id, patch).await?;
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
    let patch = serde_json::json!({ "deleted_at": serde_json::Value::Null });
    let mut result = Self::cascade_update(&self.json_provider, table, id, patch).await?;
    Ok(result)
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
    let patch = serde_json::json!({ "deleted_at": serde_json::Value::Null });
    let mut result = Self::cascade_update(mongo.as_ref(), table, id, patch).await?;
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

  pub async fn import_todo_cascade_to_json(
    &self,
    todo_id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;

    let todo = mongo
      .find_by_id("todos", todo_id)
      .await
      .map_err(|e| err_response_formatted("Find todo failed", &e.to_string()))?
      .ok_or_else(|| err_response_formatted("Todo not found in MongoDB", todo_id))?;

    let mut result = CascadeResult::new();
    result.todo_count = 1;

    self
      .json_provider
      .insert("todos", todo.clone())
      .await
      .map_err(|e| err_response_formatted("Insert todo to JSON failed", &e.to_string()))?;

    let task_filter = nosql_orm::query::Filter::Eq("todo_id".to_string(), json!(todo_id));
    let tasks = mongo
      .find_many("tasks", Some(&task_filter), None, None, None, false)
      .await
      .map_err(|e| err_response_formatted("Find tasks failed", &e.to_string()))?;
    result.task_count = tasks.len() as u64;

    let task_ids: Vec<String> = tasks
      .iter()
      .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
      .collect();

    for task in &tasks {
      self
        .json_provider
        .insert("tasks", task.clone())
        .await
        .map_err(|e| err_response_formatted("Insert task to JSON failed", &e.to_string()))?;
    }

    let mut subtask_ids: Vec<String> = Vec::new();
    if !task_ids.is_empty() {
      let task_ids_filter = nosql_orm::query::Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| json!(id)).collect(),
      );
      let subtasks = mongo
        .find_many("subtasks", Some(&task_ids_filter), None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Find subtasks failed", &e.to_string()))?;
      result.subtask_count = subtasks.len() as u64;

      subtask_ids = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      for subtask in &subtasks {
        self
          .json_provider
          .insert("subtasks", subtask.clone())
          .await
          .map_err(|e| err_response_formatted("Insert subtask to JSON failed", &e.to_string()))?;
      }
    }

    let mut all_ids: Vec<String> = task_ids.clone();
    all_ids.extend(subtask_ids.clone());

    if !all_ids.is_empty() {
      let ids_filter = nosql_orm::query::Filter::In(
        "task_id".to_string(),
        all_ids.iter().map(|id| json!(id)).collect(),
      );
      let comment_filter = nosql_orm::query::Filter::Or(vec![
        nosql_orm::query::Filter::In(
          "task_id".to_string(),
          task_ids.iter().map(|id| json!(id)).collect(),
        ),
        nosql_orm::query::Filter::In(
          "subtask_id".to_string(),
          subtask_ids.iter().map(|id| json!(id)).collect(),
        ),
      ]);
      let comments = mongo
        .find_many("comments", Some(&comment_filter), None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
      result.comment_count = comments.len() as u64;

      for comment in &comments {
        self
          .json_provider
          .insert("comments", comment.clone())
          .await
          .map_err(|e| err_response_formatted("Insert comment to JSON failed", &e.to_string()))?;
      }
    }

    let restore_patch = json!({ "deleted_at": serde_json::Value::Null });
    self
      .json_provider
      .patch("todos", todo_id, restore_patch.clone())
      .await
      .map_err(|e| err_response_formatted("Restore todo in JSON failed", &e.to_string()))?;

    let delete_patch = json!({ "deleted_at": chrono::Utc::now() });
    mongo
      .patch("todos", todo_id, delete_patch.clone())
      .await
      .map_err(|e| err_response_formatted("Soft delete todo in MongoDB failed", &e.to_string()))?;

    Ok(result)
  }

  pub async fn export_todo_cascade_to_mongo(
    &self,
    todo_id: &str,
  ) -> Result<CascadeResult, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response_formatted("MongoDB not available", ""))?;

    let todo = self
      .json_provider
      .find_by_id("todos", todo_id)
      .await
      .map_err(|e| err_response_formatted("Find todo failed", &e.to_string()))?
      .ok_or_else(|| err_response_formatted("Todo not found in JSON", todo_id))?;

    let mut result = CascadeResult::new();
    result.todo_count = 1;

    mongo
      .insert("todos", todo.clone())
      .await
      .map_err(|e| err_response_formatted("Insert todo to MongoDB failed", &e.to_string()))?;

    let task_filter = nosql_orm::query::Filter::Eq("todo_id".to_string(), json!(todo_id));
    let tasks = self
      .json_provider
      .find_many("tasks", Some(&task_filter), None, None, None, false)
      .await
      .map_err(|e| err_response_formatted("Find tasks failed", &e.to_string()))?;
    result.task_count = tasks.len() as u64;

    let task_ids: Vec<String> = tasks
      .iter()
      .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
      .collect();

    for task in &tasks {
      mongo
        .insert("tasks", task.clone())
        .await
        .map_err(|e| err_response_formatted("Insert task to MongoDB failed", &e.to_string()))?;
    }

    let mut subtask_ids: Vec<String> = Vec::new();
    if !task_ids.is_empty() {
      let task_ids_filter = nosql_orm::query::Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| json!(id)).collect(),
      );
      let subtasks = self
        .json_provider
        .find_many("subtasks", Some(&task_ids_filter), None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Find subtasks failed", &e.to_string()))?;
      result.subtask_count = subtasks.len() as u64;

      subtask_ids = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

      for subtask in &subtasks {
        mongo
          .insert("subtasks", subtask.clone())
          .await
          .map_err(|e| {
            err_response_formatted("Insert subtask to MongoDB failed", &e.to_string())
          })?;
      }
    }

    let mut all_ids: Vec<String> = task_ids.clone();
    all_ids.extend(subtask_ids.clone());

    if !all_ids.is_empty() {
      let comment_filter = nosql_orm::query::Filter::Or(vec![
        nosql_orm::query::Filter::In(
          "task_id".to_string(),
          task_ids.iter().map(|id| json!(id)).collect(),
        ),
        nosql_orm::query::Filter::In(
          "subtask_id".to_string(),
          subtask_ids.iter().map(|id| json!(id)).collect(),
        ),
      ]);
      let comments = self
        .json_provider
        .find_many("comments", Some(&comment_filter), None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Find comments failed", &e.to_string()))?;
      result.comment_count = comments.len() as u64;

      for comment in &comments {
        mongo
          .insert("comments", comment.clone())
          .await
          .map_err(|e| {
            err_response_formatted("Insert comment to MongoDB failed", &e.to_string())
          })?;
      }
    }

    let restore_patch = json!({ "deleted_at": serde_json::Value::Null });
    mongo
      .patch("todos", todo_id, restore_patch.clone())
      .await
      .map_err(|e| err_response_formatted("Restore todo in MongoDB failed", &e.to_string()))?;

    let delete_patch = json!({ "deleted_at": chrono::Utc::now() });
    self
      .json_provider
      .patch("todos", todo_id, delete_patch.clone())
      .await
      .map_err(|e| err_response_formatted("Soft delete todo in JSON failed", &e.to_string()))?;

    Ok(result)
  }
}
