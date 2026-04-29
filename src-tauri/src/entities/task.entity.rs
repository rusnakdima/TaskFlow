/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter, Result};

/* nosql_orm */
use nosql_orm::{Model, Validate};

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

#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("tasks")]
#[soft_delete]
#[one_to_many("subtasks", "subtasks", "task_id", "Cascade")]
#[one_to_many("comments", "comments", "task_id", "Cascade")]
#[many_to_one("todo", "todos", "todo_id")]
#[index("todo_id", 1)]
pub struct TaskEntity {
  pub id: Option<String>,
  #[validate(required)]
  pub todo_id: String,
  #[validate(not_empty)]
  #[validate(length(min = 1, max = 200))]
  pub title: String,
  #[validate(length(max = 5000))]
  pub description: String,
  pub status: TaskStatus,
  #[validate(not_empty)]
  // #[validate(pattern("^(low|medium|high)$"))]
  pub priority: String,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub order: i32,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct TaskCreateModel {
  #[validate(required)]
  #[validate(not_empty)]
  pub todo_id: String,
  #[validate(not_empty)]
  #[validate(length(min = 1, max = 200))]
  pub title: String,
  pub description: Option<String>,
  #[validate(not_empty)]
  // #[validate(pattern("^(low|medium|high)$"))]
  pub priority: String,
  pub start_date: String,
  pub end_date: String,
  pub order: i32,
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
      created_at: Some(now),
      updated_at: Some(now),
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
  pub comments: Option<Vec<crate::entities::comment_entity::CommentEntity>>,
}

impl nosql_orm::validators::Validate for TaskUpdateModel {
  fn validate(&self) -> nosql_orm::error::OrmResult<()> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err(nosql_orm::error::OrmError::Validation(
          "title cannot be empty".to_string(),
        ));
      }
    }
    if let Some(ref priority) = self.priority {
      if priority.is_empty() {
        return Err(nosql_orm::error::OrmError::Validation(
          "priority cannot be empty".to_string(),
        ));
      }
    }
    Ok(())
  }
}
