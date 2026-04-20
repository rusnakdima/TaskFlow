use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentEntity {
  pub id: Option<String>,
  pub author_id: String,
  pub author_name: String,
  pub content: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub task_id: Option<String>,
  #[serde(default)]
  pub subtask_id: Option<String>,
  #[serde(default)]
  pub read_by: Vec<String>,
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

impl SoftDeletable for CommentEntity {
  fn deleted_at(&self) -> Option<DateTime<Utc>> {
    self.deleted_at
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deleted_at = deleted_at;
  }
}

impl WithRelations for CommentEntity {
  fn relations() -> Vec<RelationDef> {
    vec![
      RelationDef::many_to_one("task", "tasks", "task_id"),
      RelationDef::many_to_one("subtask", "subtasks", "subtask_id"),
    ]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentCreateModel {
  pub author_id: String,
  pub author_name: String,
  pub content: String,
  pub task_id: Option<String>,
  pub subtask_id: Option<String>,
}

impl Validatable for CommentCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.author_id.is_empty() {
      return Err("author_id cannot be empty".to_string());
    }
    if self.author_name.is_empty() {
      return Err("author_name cannot be empty".to_string());
    }
    if self.content.is_empty() {
      return Err("content cannot be empty".to_string());
    }
    let has_task = self
      .task_id
      .as_deref()
      .map(|s| !s.is_empty())
      .unwrap_or(false);
    let has_subtask = self
      .subtask_id
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
      author_id: value.author_id,
      author_name: value.author_name,
      content: value.content,
      created_at: now,
      updated_at: now,
      task_id: value.task_id,
      subtask_id: value.subtask_id,
      read_by: vec![],
      deleted_at: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentUpdateModel {
  #[serde(default)]
  pub content: Option<String>,
  #[serde(default)]
  pub read_by: Option<Vec<String>>,
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