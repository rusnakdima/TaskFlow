use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentModel {
  #[serde(default)]
  pub _id: Option<ObjectId>,
  #[serde(default)]
  pub id: Option<String>,
  pub authorId: String,
  pub authorName: String,
  pub content: String,
  pub createdAt: String,
  pub updatedAt: String,
  #[serde(default)]
  pub taskId: Option<String>,
  #[serde(default)]
  pub subtaskId: Option<String>,
  #[serde(default)]
  pub readBy: Vec<String>,
  #[serde(default)]
  pub isDeleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentCreateModel {
  pub authorId: String,
  pub authorName: String,
  pub content: String,
  pub taskId: Option<String>,
  pub subtaskId: Option<String>,
}

impl Validatable for CommentCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.authorId.is_empty() {
      return Err("authorId cannot be empty".to_string());
    }
    if self.authorName.is_empty() {
      return Err("authorName cannot be empty".to_string());
    }
    if self.content.is_empty() {
      return Err("content cannot be empty".to_string());
    }
    // Must belong to exactly one of task or subtask (so task comments and subtask comments stay separate).
    // Treat null/empty as unset.
    let has_task = self
      .taskId
      .as_deref()
      .map(|s| !s.is_empty())
      .unwrap_or(false);
    let has_subtask = self
      .subtaskId
      .as_deref()
      .map(|s| !s.is_empty())
      .unwrap_or(false);
    if !has_task && !has_subtask {
      return Err("Comment must belong to either a task or a subtask".to_string());
    }
    if has_task && has_subtask {
      return Err("Comment must belong to exactly one of task or subtask, not both".to_string());
    }
    Ok(())
  }
}

impl From<CommentCreateModel> for CommentModel {
  fn from(value: CommentCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    CommentModel {
      _id: Some(ObjectId::new()),
      id: Some(uuid::Uuid::new_v4().to_string()),
      authorId: value.authorId,
      authorName: value.authorName,
      content: value.content,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
      taskId: value.taskId,
      subtaskId: value.subtaskId,
      readBy: vec![],
      isDeleted: false,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentUpdateModel {
  #[serde(default)]
  pub content: Option<String>,
  #[serde(default)]
  pub readBy: Option<Vec<String>>,
  #[serde(default)]
  pub updatedAt: Option<String>,
}

impl Validatable for CommentUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref content) = self.content {
      if content.is_empty() {
        return Err("content cannot be empty".to_string());
      }
    }
    Ok(())
  }
}
