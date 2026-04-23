/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter, Result};

/* crate */
use crate::entities::comment_entity::CommentEntity;
use crate::entities::traits::Validatable;

/* nosql_orm */
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
    let status_str = match self {
      TaskStatus::Pending => "pending",
      TaskStatus::Completed => "completed",
      TaskStatus::Skipped => "skipped",
      TaskStatus::Failed => "failed",
    };
    write!(f, "{}", status_str)
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEntity {
  pub id: Option<String>,
  pub todo_id: String,
  pub title: String,
  pub description: String,
  pub status: TaskStatus,
  pub priority: String,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub order: i32,
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
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
    self.deleted_at
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deleted_at = deleted_at;
  }
}

impl WithRelations for TaskEntity {
  fn relations() -> Vec<RelationDef> {
    vec![
      RelationDef::one_to_many("subtasks", "subtasks", "task_id"),
      RelationDef::one_to_many("comments", "comments", "task_id"),
      RelationDef::many_to_one("todo", "todos", "todo_id"),
    ]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCreateModel {
  pub todo_id: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub start_date: String,
  pub end_date: String,
  pub order: i32,
}

impl Validatable for TaskCreateModel {
  fn validate(&self) -> std::result::Result<(), String> {
    if self.todo_id.is_empty() {
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
    let formatted_start_date = if value.start_date.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.start_date) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };
    let formatted_end_date = if value.end_date.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.end_date) {
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
      todo_id: value.todo_id,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: TaskStatus::Pending,
      priority: value.priority,
      start_date: formatted_start_date,
      end_date: formatted_end_date,
      order: value.order,
      deleted_at: None,
      created_at: now,
      updated_at: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub task_id: Option<String>,
  #[serde(default)]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub status: Option<TaskStatus>,
  #[serde(default)]
  pub priority: Option<String>,
  #[serde(default)]
  pub start_date: Option<String>,
  #[serde(default)]
  pub end_date: Option<String>,
  #[serde(default)]
  pub order: Option<i32>,
  #[serde(default)]
  pub deleted_at: Option<bool>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub comments: Option<Vec<CommentEntity>>,
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
