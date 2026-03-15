/* sys lib */
use serde_json::json;
use std::collections::{HashSet, VecDeque};
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::mongodb_provider::MongodbProvider;

/* models */
use crate::helpers::response_helper::errResponseFormatted;
use crate::models::response_model::ResponseModel;

use super::cascade_ids::CascadeIds;
use super::cascade_provider::CascadeProvider;

/// MongoCascadeHandler - Handles BFS cascade ID collection for MongoDB provider
#[derive(Clone)]
pub struct MongoCascadeHandler {
  mongodbProvider: Arc<MongodbProvider>,
}

impl MongoCascadeHandler {
  pub fn new(mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self { mongodbProvider }
  }
}

/// Implement CascadeProvider trait for MongoCascadeHandler
impl CascadeProvider for MongoCascadeHandler {
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

impl MongoCascadeHandler {
  /// Collect all cascade IDs for MongoDB using BFS with proper cycle detection
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
    let tasks = self
      .mongodbProvider
      .getAllWithDeleted("tasks", Some(json!({"todoId": todo_id})))
      .await
      .map_err(|e| errResponseFormatted("Mongo cascade failed", &e.to_string()))?;

    for task in tasks {
      if let Some(task_id) = task.get("id").and_then(|v| v.as_str()) {
        let task_id_str = task_id.to_string();
        cascade_ids.task_ids.push(task_id_str.clone());
        queue.push_back(("tasks".to_string(), task_id_str));

        // Collect ALL task comments (including deleted ones)
        let task_comments = self
          .mongodbProvider
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
    let todo_comments = self
      .mongodbProvider
      .getAllWithDeleted("comments", Some(json!({"todoId": todo_id})))
      .await
      .unwrap_or_default();

    for comment in todo_comments {
      if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
        cascade_ids.comment_ids.push(comment_id.to_string());
      }
    }

    // Collect ALL todo-level comments (comments directly on todo, not on tasks)
    let todo_comments = self
      .mongodbProvider
      .getAllWithDeleted("comments", Some(json!({"todoId": todo_id})))
      .await
      .unwrap_or_default();

    for comment in todo_comments {
      if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
        cascade_ids.comment_ids.push(comment_id.to_string());
      }
    }

    // Fetch ALL chats for this todo (including deleted ones)
    let chats = self
      .mongodbProvider
      .getAllWithDeleted("chats", Some(json!({ "todoId": todo_id })))
      .await
      .unwrap_or_default();

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
    let subtasks = self
      .mongodbProvider
      .getAllWithDeleted("subtasks", Some(json!({"taskId": task_id})))
      .await
      .map_err(|e| errResponseFormatted("Mongo cascade failed", &e.to_string()))?;

    // Collect all subtask IDs first
    let mut subtask_ids: Vec<&str> = Vec::new();
    for subtask in &subtasks {
      if let Some(subtask_id) = subtask.get("id").and_then(|v| v.as_str()) {
        cascade_ids.subtask_ids.push(subtask_id.to_string());
        subtask_ids.push(subtask_id);
      }
    }

    // Collect ALL subtask comments in one query (including deleted ones)
    if !subtask_ids.is_empty() {
      let subtask_comments = self
        .mongodbProvider
        .getAllWithDeleted("comments", Some(json!({"subtaskId": {"$in": subtask_ids}})))
        .await
        .unwrap_or_default();

      for comment in subtask_comments {
        if let Some(comment_id) = comment.get("id").and_then(|v| v.as_str()) {
          cascade_ids.comment_ids.push(comment_id.to_string());
        }
      }
    }

    // Collect ALL task-level comments (comments directly on task)
    let task_comments = self
      .mongodbProvider
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
    let subtask_comments = self
      .mongodbProvider
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

  /// Handle MongoDB Cascade (delete/restore)
  pub async fn handleCascade(
    &self,
    table: &str,
    id: &str,
    is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    let total_start = std::time::Instant::now();

    // Collect all IDs to cascade
    let cascade_ids = self.collectCascadeIds(table, id).await?;

    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let update_data = json!({
      "isDeleted": !is_restore,
      "updatedAt": timestamp
    });

    // Update all tables
    if !cascade_ids.task_ids.is_empty() {
      for tid in &cascade_ids.task_ids {
        let _ = self
          .mongodbProvider
          .mongodbCrud
          .update("tasks", tid, update_data.clone())
          .await;
      }
    }

    if !cascade_ids.subtask_ids.is_empty() {
      for sid in &cascade_ids.subtask_ids {
        let _ = self
          .mongodbProvider
          .mongodbCrud
          .update("subtasks", sid, update_data.clone())
          .await;
      }
    }

    // Update comments
    if !cascade_ids.comment_ids.is_empty() {
      for cid in &cascade_ids.comment_ids {
        let _ = self
          .mongodbProvider
          .mongodbCrud
          .update("comments", cid, update_data.clone())
          .await;
      }
    }

    if !cascade_ids.chat_ids.is_empty() {
      for cid in &cascade_ids.chat_ids {
        let _ = self
          .mongodbProvider
          .mongodbCrud
          .update("chats", cid, update_data.clone())
          .await;
      }
    }

    let _total_time = total_start.elapsed();
    Ok(cascade_ids)
  }
}
