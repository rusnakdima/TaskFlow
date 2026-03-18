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

impl JsonCascadeHandler {
  /// Collect all cascade IDs iteratively using BFS with proper cycle detection
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
    let tasks: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("tasks", Some(json!({"todoId": todoId})))
      .await
      .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

    for task in tasks {
      if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
        let taskIdStr = taskId.to_string();
        cascadeIds.addTaskId(taskIdStr.clone());
        queue.push_back(("tasks".to_string(), taskIdStr));
      }
    }

    // Fetch ALL chats for this todo (including deleted ones)
    let chats: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("chats", Some(json!({ "todoId": todoId })))
      .await
      .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

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
    let subtasks: Vec<serde_json::Value> = self
      .jsonProvider
      .getAllWithDeleted("subtasks", Some(json!({"taskId": taskId})))
      .await
      .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

    for subtask in subtasks {
      if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
        let subtaskIdStr = subtaskId.to_string();
        cascadeIds.addSubtaskId(subtaskIdStr.clone());

        // Collect ALL subtask comments (including deleted ones)
        let subtaskComments: Vec<serde_json::Value> = self
          .jsonProvider
          .getAllWithDeleted("comments", Some(json!({"subtaskId": subtaskId})))
          .await
          .unwrap_or_default();

        for comment in subtaskComments {
          if let Some(commentId) = comment.get("id").and_then(|v| v.as_str()) {
            cascadeIds.addCommentId(commentId.to_string());
          }
        }
      }
    }

    // Collect ALL task-level comments (comments directly on task, not on subtasks)
    let taskComments: Vec<serde_json::Value> = self
      .jsonProvider
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
    let subtaskComments: Vec<serde_json::Value> = self
      .jsonProvider
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

  /// Handle JSON Cascade (delete/restore) with batch updates
  pub async fn handleCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    // Collect all IDs to cascade
    let cascadeIds = self.collectCascadeIds(table, id).await?;

    let updateData = json!({ "isDeleted": !isRestore });

    // Batch update all tables using updateAll
    if !cascadeIds.taskIds.is_empty() {
      let _ = self
        .batchUpdate("tasks", &cascadeIds.taskIds, &updateData)
        .await?;
    }

    if !cascadeIds.subtaskIds.is_empty() {
      let _ = self
        .batchUpdate("subtasks", &cascadeIds.subtaskIds, &updateData)
        .await?;
    }

    // Batch update comments
    if !cascadeIds.commentIds.is_empty() {
      let _ = self
        .batchUpdate("comments", &cascadeIds.commentIds, &updateData)
        .await?;
    }

    if !cascadeIds.chatIds.is_empty() {
      let _ = self
        .batchUpdate("chats", &cascadeIds.chatIds, &updateData)
        .await?;
    }

    Ok(cascadeIds)
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
    let updatedRecords = self.prepareUpdatedRecords(table, ids, update_data).await?;
    let count = updatedRecords.len();

    if count > 0 {
      self
        .jsonProvider
        .updateAll(table, updatedRecords)
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
    updateData: &serde_json::Value,
  ) -> Result<Vec<serde_json::Value>, ResponseModel> {
    if ids.is_empty() {
      return Ok(Vec::new());
    }

    let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
    let mut updatedRecords: Vec<serde_json::Value> = Vec::with_capacity(ids.len());

    for id in ids {
      if let Ok(mut record) = self.jsonProvider.get(table, id).await {
        if let Some(recordObj) = record.as_object_mut() {
          recordObj.insert("isDeleted".to_string(), updateData["isDeleted"].clone());
          recordObj.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(timestamp.clone()),
          );
          updatedRecords.push(record);
        }
      }
    }

    Ok(updatedRecords)
  }
}
