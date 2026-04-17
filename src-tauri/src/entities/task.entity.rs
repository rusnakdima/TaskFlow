/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter, Result};

use crate::entities::comment_entity::CommentEntity;
use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
  #[serde(rename = "pending")]
  Pending,
  #[serde(rename = "completed")]
  Completed,
  #[serde(rename = "skipped")]
  Skipped,
  #[serde(rename = "failed")]
  Failed,
}

impl Display for TaskStatus {
  fn fmt(&self, f: &mut Formatter<'_>) -> Result {
    let statusStr = match self {
      TaskStatus::Pending => "pending",
      TaskStatus::Completed => "completed",
      TaskStatus::Skipped => "skipped",
      TaskStatus::Failed => "failed",
    };
    write!(f, "{}", statusStr)
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEntity {
  pub id: Option<String>,
  pub todoId: String,
  pub title: String,
  pub description: String,
  pub status: TaskStatus,
  pub priority: String,
  pub startDate: Option<String>,
  pub endDate: Option<String>,
  pub order: i32,
  pub deleted_at: Option<DateTime<Utc>>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub assignees: Vec<String>,
  pub dependsOn: Vec<String>,
}

impl Entity for TaskEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("tasks")
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
pub struct TaskCreateModel {
  pub todoId: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
}

impl Validatable for TaskCreateModel {
  fn validate(&self) -> std::result::Result<(), String> {
    if self.todoId.is_empty() {
      return Err("todoId cannot be empty".to_string());
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

impl From<TaskCreateModel> for TaskEntity {
  fn from(value: TaskCreateModel) -> Self {
    let now = Utc::now();
    let formattedStartDate = if value.startDate.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.startDate) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };
    let formattedEndDate = if value.endDate.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.endDate) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };

    TaskEntity {
      id: None,
      todoId: value.todoId,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: TaskStatus::Pending,
      priority: value.priority,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      order: value.order,
      deleted_at: None,
      created_at: now,
      updated_at: now,
      assignees: vec![],
      dependsOn: vec![],
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub todoId: Option<String>,
  #[serde(default)]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub status: Option<TaskStatus>,
  #[serde(default)]
  pub priority: Option<String>,
  #[serde(default)]
  pub startDate: Option<String>,
  #[serde(default)]
  pub endDate: Option<String>,
  #[serde(default)]
  pub order: Option<i32>,
  #[serde(default)]
  pub deleted_at: Option<bool>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub comments: Option<Vec<crate::entities::comment_entity::CommentEntity>>,
}

impl Validatable for TaskUpdateModel {
  fn validate(&self) -> std::result::Result<(), String> {
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
