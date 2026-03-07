/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter, Result};

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
pub struct TaskModel {
  pub _id: ObjectId,
  pub id: String,
  pub todoId: String,
  pub title: String,
  pub description: String,
  pub status: TaskStatus,
  pub priority: String,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
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

impl TaskCreateModel {
  pub fn validate(&self) -> std::result::Result<(), String> {
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

impl From<TaskCreateModel> for TaskModel {
  fn from(value: TaskCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let mut formattedStartDate = String::new();
    let mut formattedEndDate = String::new();
    if value.startDate != "" {
      if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.startDate) {
        formattedStartDate = dt
          .with_timezone(&chrono::Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string();
      }
    }
    if value.endDate != "" {
      if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.endDate) {
        formattedEndDate = dt
          .with_timezone(&chrono::Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string();
      }
    }

    TaskModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      todoId: value.todoId,
      title: value.title,
      description: value.description.unwrap_or("".to_string()),
      status: TaskStatus::Pending,
      priority: value.priority,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      order: value.order,
      isDeleted: false,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskUpdateModel {
  pub _id: Option<ObjectId>,
  pub id: String,
  pub todoId: Option<String>,
  pub title: Option<String>,
  pub description: Option<String>,
  pub status: Option<TaskStatus>,
  pub priority: Option<String>,
  pub startDate: Option<String>,
  pub endDate: Option<String>,
  pub order: Option<i32>,
  pub isDeleted: Option<bool>,
  pub updatedAt: Option<String>,
}

impl TaskUpdateModel {
  pub fn validate(&self) -> std::result::Result<(), String> {
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
