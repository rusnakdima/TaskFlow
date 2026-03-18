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
  async fn deleteWithCascade(&self, table: &str, id: &str) -> Result<CascadeIds, ResponseModel> {
    self.collectCascadeIds(table, id).await
  }

  async fn archiveWithCascade(
    &self,
    table: &str,
    id: &str,
    _isRestore: bool,
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
    let mut cascadeIds = CascadeIds::default();
    let mut visitedTodos = HashSet::new();
    let mut visitedTasks = HashSet::new();
    let mut visitedSubtasks = HashSet::new();

    // Queue for BFS: (table, id)
    let mut queue: VecDeque<(String, String)> = VecDeque::new();
    queue.push_back((table.to_string(), id.to_string()));

    while let Some((currentTable, currentId)) = queue.pop_front() {
      // Check visited BEFORE processing to prevent duplicates
      let alreadyVisited = match currentTable.as_str() {
        "todos" => !visitedTodos.insert(currentId.clone()),
        "tasks" => !visitedTasks.insert(currentId.clone()),
        "subtasks" => !visitedSubtasks.insert(currentId.clone()),
        _ => false,
      };

      if alreadyVisited {
        continue;
      }

      if currentTable == "todos" {
        self
          .collectTodoChildren(&currentId, &mut cascadeIds, &mut queue)
          .await?;
      } else if currentTable == "tasks" {
        self
          .collectTaskChildren(&currentId, &mut cascadeIds)
          .await?;
      } else if currentTable == "subtasks" {
        self
          .collectSubtaskChildren(&currentId, &mut cascadeIds)
          .await?;
      }
    }

    Ok(cascadeIds)
  }

  /// Collect children for a todo (tasks, comments, and chats)
  /// Uses getAllWithDeleted to fetch ALL children regardless of isDeleted status
  async fn collectTodoChildren(
    &self,
    todoId: &str,
    cascadeIds: &mut CascadeIds,
    queue: &mut VecDeque<(String, String)>,
  ) -> Result<(), ResponseModel> {
    // Fetch ALL tasks for this todo (including deleted ones for proper cascade)
    let tasks = self
      .mongodbProvider
      .getAllWithDeleted("tasks", Some(json!({"todoId": todoId})))
      .await
      .map_err(|e| errResponseFormatted("Mongo cascade failed", &e.to_string()))?;

    for task in tasks {
      if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
        let taskIdStr = taskId.to_string();
        cascadeIds.addTaskId(taskIdStr.clone());
        queue.push_back(("tasks".to_string(), taskIdStr));
      }
    }

    // Fetch ALL chats for this todo (including deleted ones)
    let chats = self
      .mongodbProvider
      .getAllWithDeleted("chats", Some(json!({ "todoId": todoId })))
      .await
      .unwrap_or_default();

    for chat in chats {
      if let Some(chatId) = chat.get("id").and_then(|v| v.as_str()) {
        cascadeIds.addChatId(chatId.to_string());
      }
    }

    Ok(())
  }

  /// Collect children for a task (subtasks and comments)
  /// Uses getAllWithDeleted to fetch ALL children regardless of isDeleted status
  async fn collectTaskChildren(
    &self,
    taskId: &str,
    cascadeIds: &mut CascadeIds,
  ) -> Result<(), ResponseModel> {
    // Fetch ALL subtasks for this task (including deleted ones)
    let subtasks = self
      .mongodbProvider
      .getAllWithDeleted("subtasks", Some(json!({"taskId": taskId})))
      .await
      .map_err(|e| errResponseFormatted("Mongo cascade failed", &e.to_string()))?;

    // Collect all subtask IDs first
    let mut subtaskIds: Vec<&str> = Vec::new();
    for subtask in &subtasks {
      if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
        cascadeIds.addSubtaskId(subtaskId.to_string());
        subtaskIds.push(subtaskId);
      }
    }

    // Collect ALL subtask comments in one query (including deleted ones)
    if !subtaskIds.is_empty() {
      let subtaskComments = self
        .mongodbProvider
        .getAllWithDeleted("comments", Some(json!({"subtaskId": {"$in": subtaskIds}})))
        .await
        .unwrap_or_default();

      for comment in subtaskComments {
        if let Some(commentId) = comment.get("id").and_then(|v| v.as_str()) {
          cascadeIds.addCommentId(commentId.to_string());
        }
      }
    }

    // Collect ALL task-level comments (comments directly on task)
    let taskComments = self
      .mongodbProvider
      .getAllWithDeleted("comments", Some(json!({"taskId": taskId})))
      .await
      .unwrap_or_default();

    for comment in taskComments {
      if let Some(commentId) = comment.get("id").and_then(|v| v.as_str()) {
        cascadeIds.addCommentId(commentId.to_string());
      }
    }

    Ok(())
  }

  /// Collect children for a subtask (comments only)
  /// Uses getAllWithDeleted to fetch ALL children regardless of isDeleted status
  async fn collectSubtaskChildren(
    &self,
    subtaskId: &str,
    cascadeIds: &mut CascadeIds,
  ) -> Result<(), ResponseModel> {
    // Collect ALL subtask comments (including deleted ones)
    let subtaskComments = self
      .mongodbProvider
      .getAllWithDeleted("comments", Some(json!({"subtaskId": subtaskId})))
      .await
      .unwrap_or_default();

    for comment in subtaskComments {
      if let Some(commentId) = comment.get("id").and_then(|v| v.as_str()) {
        cascadeIds.addCommentId(commentId.to_string());
      }
    }

    Ok(())
  }

  /// Handle MongoDB Cascade (delete/restore)
  pub async fn handleCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    // Collect all IDs to cascade
    let cascadeIds = self.collectCascadeIds(table, id).await?;

    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let updateData = json!({
      "isDeleted": !isRestore,
      "updatedAt": timestamp
    });

    let mut failed: Vec<String> = Vec::new();

    // Update all tables — collect failures instead of silently discarding them (H-10)
    for tid in &cascadeIds.taskIds {
      if let Err(e) = self
        .mongodbProvider
        .mongodbCrud
        .update("tasks", tid, updateData.clone())
        .await
      {
        failed.push(format!("task {}: {}", tid, e));
      }
    }

    for sid in &cascadeIds.subtaskIds {
      if let Err(e) = self
        .mongodbProvider
        .mongodbCrud
        .update("subtasks", sid, updateData.clone())
        .await
      {
        failed.push(format!("subtask {}: {}", sid, e));
      }
    }

    for cid in &cascadeIds.commentIds {
      if let Err(e) = self
        .mongodbProvider
        .mongodbCrud
        .update("comments", cid, updateData.clone())
        .await
      {
        failed.push(format!("comment {}: {}", cid, e));
      }
    }

    for cid in &cascadeIds.chatIds {
      if let Err(e) = self
        .mongodbProvider
        .mongodbCrud
        .update("chats", cid, updateData.clone())
        .await
      {
        failed.push(format!("chat {}: {}", cid, e));
      }
    }

    if !failed.is_empty() {
      return Err(errResponseFormatted(
        "Partial cascade failure",
        &failed.join("; "),
      ));
    }

    Ok(cascadeIds)
  }
}
