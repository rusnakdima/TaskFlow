/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter, Result};

/* models */
use crate::models::{sync_metadata_model::SyncMetadata, todo_model::TodoFullModel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub enum PriorityTask {
  Low,
  Medium,
  High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
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
  #[allow(non_snake_case)]
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

impl Display for PriorityTask {
  fn fmt(&self, f: &mut Formatter) -> Result {
    match self {
      PriorityTask::Low => write!(f, "Low"),
      PriorityTask::Medium => write!(f, "Medium"),
      PriorityTask::High => write!(f, "High"),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
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
#[allow(non_snake_case)]
pub struct TaskCreateModel {
  pub todoId: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
  #[serde(rename = "_syncMetadata")]
  pub sync_metadata: Option<SyncMetadata>,
}

#[allow(non_snake_case)]
impl From<TaskCreateModel> for TaskModel {
  fn from(value: TaskCreateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
    let mut formattedStartDate = String::new();
    let mut formattedEndDate = String::new();
    if value.startDate != "" {
      formattedStartDate = chrono::DateTime::parse_from_rfc3339(&value.startDate)
        .unwrap()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
    }
    if value.endDate != "" {
      formattedEndDate = chrono::DateTime::parse_from_rfc3339(&value.endDate)
        .unwrap()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
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
#[allow(non_snake_case)]
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
  pub updatedAt: String,
  #[serde(rename = "_syncMetadata")]
  pub sync_metadata: Option<SyncMetadata>,
}

#[allow(non_snake_case)]
impl TaskUpdateModel {
  pub fn applyTo(&self, existing: TaskModel) -> TaskModel {
    let mut formattedStartDate = existing.startDate.clone();
    let mut formattedEndDate = existing.endDate.clone();

    if let Some(ref startDate) = self.startDate {
      if startDate != "" {
        formattedStartDate = chrono::DateTime::parse_from_rfc3339(startDate)
          .unwrap()
          .to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
      } else {
        formattedStartDate = startDate.clone();
      }
    }

    if let Some(ref endDate) = self.endDate {
      if endDate != "" {
        formattedEndDate = chrono::DateTime::parse_from_rfc3339(endDate)
          .unwrap()
          .to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
      } else {
        formattedEndDate = endDate.clone();
      }
    }

    TaskModel {
      _id: existing._id,
      id: existing.id,
      todoId: existing.todoId,
      title: self.title.clone().unwrap_or(existing.title),
      description: self.description.clone().unwrap_or(existing.description),
      status: self.status.clone().unwrap_or(existing.status),
      priority: self.priority.clone().unwrap_or(existing.priority),
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      order: self.order.unwrap_or(existing.order),
      isDeleted: self.isDeleted.unwrap_or(existing.isDeleted),
      createdAt: existing.createdAt,
      updatedAt: self.updatedAt.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
#[allow(unused)]
pub struct TaskFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub todo: TodoFullModel,
  pub title: String,
  pub description: String,
  pub status: TaskStatus,
  pub priority: PriorityTask,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}
