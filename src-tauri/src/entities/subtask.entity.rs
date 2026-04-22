/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskEntity {
  pub id: Option<String>,
  pub task_id: String,
  pub title: String,
  pub description: String,
  pub status: crate::entities::task_entity::TaskStatus,
  pub priority: String,
  pub order: i32,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

impl Entity for SubtaskEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("subtasks")
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

impl SoftDeletable for SubtaskEntity {
  fn deleted_at(&self) -> Option<DateTime<Utc>> {
    self.deleted_at
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deleted_at = deleted_at;
  }
}

impl WithRelations for SubtaskEntity {
  fn relations() -> Vec<RelationDef> {
    vec![
      RelationDef::many_to_one("task", "tasks", "task_id"),
      RelationDef::one_to_many("comments", "comments", "subtask_id"),
    ]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskCreateModel {
  pub task_id: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub order: i32,
}

impl Validatable for SubtaskCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.task_id.is_empty() {
      return Err("task_id cannot be empty".to_string());
    }
    if self.title.is_empty() {
      return Err("title cannot be empty".to_string());
    }
    if self.priority.is_empty() {
      return Err("priority cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<SubtaskCreateModel> for SubtaskEntity {
  fn from(value: SubtaskCreateModel) -> Self {
    let now = Utc::now();

    SubtaskEntity {
      id: None,
      task_id: value.task_id,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: crate::entities::task_entity::TaskStatus::Pending,
      priority: value.priority,
      order: value.order,
      deleted_at: None,
      created_at: now,
      updated_at: now,
      start_date: None,
      end_date: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub task_id: Option<String>,
  #[serde(default)]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub status: Option<crate::entities::task_entity::TaskStatus>,
  #[serde(default)]
  pub priority: Option<String>,
  #[serde(default)]
  pub order: Option<i32>,
  #[serde(default)]
  pub deleted_at: Option<bool>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub comments: Option<Vec<crate::entities::comment_entity::CommentEntity>>,
  #[serde(default)]
  #[serde(rename = "_syncMetadata")]
  pub sync_metadata: Option<crate::entities::sync_metadata_entity::SyncMetadata>,
}

impl Validatable for SubtaskUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err("title cannot be empty".to_string());
      }
    }
    if let Some(ref priority) = self.priority {
      if priority.is_empty() {
        return Err("priority cannot be empty".to_string());
      }
    }
    Ok(())
  }
}
