use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentEntity {
  pub id: Option<String>,
  pub authorId: String,
  pub authorName: String,
  pub content: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub taskId: Option<String>,
  #[serde(default)]
  pub subtaskId: Option<String>,
  #[serde(default)]
  pub readBy: Vec<String>,
  pub deleted_at: Option<DateTime<Utc>>,
}

impl Entity for CommentEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("comments")
  }

  fn get_id(&self) -> Option<String> {
    self.id.clone()
  }

  fn set_id(&mut self, id: String) {
    self.id = Some(id);
  }

  fn is_soft_deletable() -> bool {
    true
  }
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

impl From<CommentCreateModel> for CommentEntity {
  fn from(value: CommentCreateModel) -> Self {
    let now = Utc::now();

    CommentEntity {
      id: None,
      authorId: value.authorId,
      authorName: value.authorName,
      content: value.content,
      created_at: now,
      updated_at: now,
      taskId: value.taskId,
      subtaskId: value.subtaskId,
      readBy: vec![],
      deleted_at: None,
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
  pub updated_at: Option<String>,
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
