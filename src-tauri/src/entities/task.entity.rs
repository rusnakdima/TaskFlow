/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter, Result};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};

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
#[serde(rename_all = "camelCase")]
pub struct TaskEntity {
  pub id: Option<String>,
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub status: TaskStatus,
  pub priority: String,
  pub startDate: Option<String>,
  pub endDate: Option<String>,
  pub order: i32,
  pub deletedAt: Option<DateTime<Utc>>,
  pub createdAt: DateTime<Utc>,
  pub updatedAt: DateTime<Utc>,
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

impl SoftDeletable for TaskEntity {
  fn deleted_at(&self) -> Option<DateTime<Utc>> {
    self.deletedAt
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deletedAt = deleted_at;
  }
}

impl WithRelations for TaskEntity {
  fn relations() -> Vec<RelationDef> {
    vec![
      RelationDef::one_to_many("subtasks", "subtasks", "taskId"),
      RelationDef::one_to_many("comments", "comments", "taskId"),
      RelationDef::many_to_one("todo", "todos", "taskId"),
    ]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    let formatted_start_date = if value.startDate.is_empty() {
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
    let formatted_end_date = if value.endDate.is_empty() {
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
      taskId: value.todoId,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: TaskStatus::Pending,
      priority: value.priority,
      startDate: formatted_start_date,
      endDate: formatted_end_date,
      order: value.order,
      deletedAt: None,
      createdAt: now,
      updatedAt: now,
      assignees: vec![],
      dependsOn: vec![],
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub taskId: Option<String>,
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
  pub deletedAt: Option<bool>,
  #[serde(default)]
  pub updatedAt: Option<String>,
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