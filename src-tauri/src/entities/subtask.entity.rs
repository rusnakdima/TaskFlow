/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::comment_entity::CommentEntity;
use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskEntity {
  pub id: Option<String>,
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub status: crate::entities::task_entity::TaskStatus,
  pub priority: String,
  pub order: i32,
  pub deleted_at: Option<DateTime<Utc>>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub startDate: Option<String>,
  pub endDate: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskCreateModel {
  pub taskId: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub order: i32,
}

impl Validatable for SubtaskCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.taskId.is_empty() {
      return Err("taskId cannot be empty".to_string());
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
      taskId: value.taskId,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: crate::entities::task_entity::TaskStatus::Pending,
      priority: value.priority,
      order: value.order,
      deleted_at: None,
      created_at: now,
      updated_at: now,
      startDate: None,
      endDate: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub taskId: Option<String>,
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
