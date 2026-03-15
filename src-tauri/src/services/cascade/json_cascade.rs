/* sys lib */
use serde_json::json;
use std::collections::{HashSet, VecDeque};

/* providers */
use crate::providers::json_provider::JsonProvider;

/* models */
use crate::helpers::response_helper::errResponseFormatted;
use crate::models::response_model::ResponseModel;

use super::cascade_ids::CascadeIds;
use super::cascade_provider::CascadeProvider;

/// JsonCascadeHandler - Handles BFS cascade ID collection for JSON provider
#[derive(Clone)]
pub struct JsonCascadeHandler {
  jsonProvider: JsonProvider,
}

impl JsonCascadeHandler {
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self { jsonProvider }
  }
}

/// Implement CascadeProvider trait for JsonCascadeHandler
impl CascadeProvider for JsonCascadeHandler {
  async fn delete_with_cascade(&self, table: &str, id: &str) -> Result<CascadeIds, ResponseModel> {
    self.collectCascadeIds(table, id).await
  }

  async fn archive_with_cascade(
    &self,
    table: &str,
    id: &str,
    _is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    self.collectCascadeIds(table, id).await
  }
}

impl JsonCascadeHandler {
  /// Collect all cascade IDs iteratively using BFS with proper cycle detection
  pub async fn collectCascadeIds(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let start_time = std::time::Instant::now();

    let mut cascade_ids = CascadeIds::default();
    let mut visited_todos = HashSet::new();
    let mut visited_tasks = HashSet::new();
    let mut visited_subtasks = HashSet::new();

    // Queue for BFS: (table, id)
    let mut queue: VecDeque<(String, String)> = VecDeque::new();
    queue.push_back((table.to_string(), id.to_string()));

    while let Some((current_table, current_id)) = queue.pop_front() {
      // Check visited BEFORE processing to prevent duplicates
      let already_visited = match current_table.as_str() {
        "todos" => !visited_todos.insert(current_id.clone()),
        "tasks" => !visited_tasks.insert(current_id.clone()),
        "subtasks" => !visited_subtasks.insert(current_id.clone()),
        _ => false,
      };

      if already_visited {
        continue;
      }

      if current_table == "todos" {
        self
          .collectTodoChildren(&current_id, &mut cascade_ids, &mut queue)
          .await?;
      } else if current_table == "tasks" {
        self
          .collectTaskChildren(&current_id, &mut cascade_ids)
          .await?;
      } else if current_table == "subtasks" {
        self
          .collectSubtaskChildren(&current_id, &mut cascade_ids)
          .await?;
      }
    }

    let _elapsed = start_time.elapsed();
    Ok(cascade_ids)
  }

  /// Collect children for a todo (tasks, comments, and chats)
  /// Uses getAllWithDeleted to fetch ALL children regardless of isDeleted status
  async fn collectTodoChildren(
    &self,
    todo_id: &str,
    cascade_ids: &mut CascadeIds,
    queue: &mut VecDeque<(String, String)>,
  ) -> Result<(), ResponseModel> {
    // Fetch ALL tasks for this todo (including deleted ones for proper cascade)
    let tasks: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("tasks", Some(json!({"todoId": todo_id})))
      .await
      .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

    for task in tasks {
      if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
        let task_id_str = task_id.to_string();
        cascade_ids.task_ids.push(task_id_str.clone());
        queue.push_back(("tasks".to_string(), task_id_str));

        // Collect ALL task comments (including deleted ones)
        let task_comments: Vec<serde_json::Value> = self
          .jsonProvider
          .getAllWithDeleted("comments", Some(json!({"taskId": task_id})))
          .await
          .unwrap_or_default();

        for comment in task_comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            cascade_ids.comment_ids.push(comment_id.to_string());
          }
        }
      }
    }

    // Collect ALL todo-level comments (comments directly on todo, not on tasks)
    let todo_comments: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("comments", Some(json!({"todoId": todo_id})))
      .await
      .unwrap_or_default();

    for comment in todo_comments {
      if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
        cascade_ids.comment_ids.push(comment_id.to_string());
      }
    }

    // Fetch ALL chats for this todo (including deleted ones)
    let chats: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("chats", Some(json!({ "todoId": todo_id })))
      .await
      .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

    for chat in chats {
      if let Some(chat_id) = chat.get("id").and_then(|v| v.as_str()) {
        cascade_ids.chat_ids.push(chat_id.to_string());
      }
    }

    Ok(())
  }

  /// Collect children for a task (subtasks and comments)
  /// Uses getAllWithDeleted to fetch ALL children regardless of isDeleted status
  async fn collectTaskChildren(
    &self,
    task_id: &str,
    cascade_ids: &mut CascadeIds,
  ) -> Result<(), ResponseModel> {
    // Fetch ALL subtasks for this task (including deleted ones)
    let subtasks: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("subtasks", Some(json!({"taskId": task_id})))
      .await
      .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

    for subtask in subtasks {
      if let Some(subtask_id) = subtask.get("id").and_then(|v| v.as_str()) {
        let subtask_id_str = subtask_id.to_string();
        cascade_ids.subtask_ids.push(subtask_id_str.clone());

        // Collect ALL subtask comments (including deleted ones)
        let subtask_comments: Vec<serde_json::Value> = self
          .jsonProvider
          .getAllWithDeleted("comments", Some(json!({"subtaskId": subtask_id})))
          .await
          .unwrap_or_default();

        for comment in subtask_comments {
          if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
            cascade_ids.comment_ids.push(comment_id.to_string());
          }
        }
      }
    }

    // Collect ALL task-level comments (comments directly on task, not on subtasks)
    let task_comments: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("comments", Some(json!({"taskId": task_id})))
      .await
      .unwrap_or_default();

    for comment in task_comments {
      if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
        cascade_ids.comment_ids.push(comment_id.to_string());
      }
    }

    Ok(())
  }

  /// Collect children for a subtask (comments only)
  /// Uses getAllWithDeleted to fetch ALL children regardless of isDeleted status
  async fn collectSubtaskChildren(
    &self,
    subtask_id: &str,
    cascade_ids: &mut CascadeIds,
  ) -> Result<(), ResponseModel> {
    // Collect ALL subtask comments (including deleted ones)
    let subtask_comments: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("comments", Some(json!({"subtaskId": subtask_id})))
      .await
      .unwrap_or_default();

    for comment in subtask_comments {
      if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
        cascade_ids.comment_ids.push(comment_id.to_string());
      }
    }

    Ok(())
  }

  /// Handle JSON Cascade (delete/restore) with batch updates
  pub async fn handleCascade(
    &self,
    table: &str,
    id: &str,
    is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    let total_start = std::time::Instant::now();

    // Collect all IDs to cascade
    let cascade_ids = self.collectCascadeIds(table, id).await?;

    let update_data = json!({ "isDeleted": !is_restore });

    // Batch update all tables using updateAll
    if !cascade_ids.task_ids.is_empty() {
      let _ = self
        .batchUpdate("tasks", &cascade_ids.task_ids, &update_data)
        .await?;
    }

    if !cascade_ids.subtask_ids.is_empty() {
      let _ = self
        .batchUpdate("subtasks", &cascade_ids.subtask_ids, &update_data)
        .await?;
    }

    // Batch update comments
    if !cascade_ids.comment_ids.is_empty() {
      let _ = self
        .batchUpdate("comments", &cascade_ids.comment_ids, &update_data)
        .await?;
    }

    if !cascade_ids.chat_ids.is_empty() {
      let _ = self
        .batchUpdate("chats", &cascade_ids.chat_ids, &update_data)
        .await?;
    }

    let _total_time = total_start.elapsed();
    Ok(cascade_ids)
  }

  /// Batch update using updateAll - single disk write operation
  async fn batchUpdate(
    &self,
    table: &str,
    ids: &[String],
    update_data: &serde_json::Value,
  ) -> Result<usize, ResponseModel> {
    if ids.is_empty() {
      return Ok(0);
    }

    // Prepare updated records
    let updated_records = self.prepareUpdatedRecords(table, ids, update_data).await?;
    let count = updated_records.len();

    if count > 0 {
      self
        .jsonProvider
        .updateAll(table, updated_records)
        .await
        .map_err(|e| errResponseFormatted("Cascade batch update failed", &e.to_string()))?;
    }

    Ok(count)
  }

  /// Prepare updated records for batch update
  async fn prepareUpdatedRecords(
    &self,
    table: &str,
    ids: &[String],
    update_data: &serde_json::Value,
  ) -> Result<Vec<serde_json::Value>, ResponseModel> {
    if ids.is_empty() {
      return Ok(Vec::new());
    }

    let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
    let mut updated_records: Vec<serde_json::Value> = Vec::with_capacity(ids.len());

    for id in ids {
      if let Ok(mut record) = self.jsonProvider.get(table, id).await {
        if let Some(record_obj) = record.as_object_mut() {
          record_obj.insert("isDeleted".to_string(), update_data["isDeleted"].clone());
          record_obj.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(timestamp.clone()),
          );
          updated_records.push(record);
        }
      }
    }

    Ok(updated_records)
  }
}
