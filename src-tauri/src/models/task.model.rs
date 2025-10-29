/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};
use std::fmt::Display;

/* models */
use crate::models::todo_model::TodoFullModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub enum PriorityTask {
  Low,
  Medium,
  High,
}

impl Display for PriorityTask {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
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
  pub isCompleted: bool,
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
  pub description: String,
  pub priority: String,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
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
      description: value.description,
      isCompleted: false,
      priority: value.priority.to_string(),
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
  pub _id: ObjectId,
  pub id: String,
  pub todoId: String,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: String,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}

#[allow(non_snake_case)]
impl From<TaskUpdateModel> for TaskModel {
  fn from(value: TaskUpdateModel) -> Self {
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
      _id: value._id,
      id: value.id,
      todoId: value.todoId,
      title: value.title,
      description: value.description,
      isCompleted: value.isCompleted,
      priority: value.priority.to_string(),
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      order: value.order,
      isDeleted: value.isDeleted,
      createdAt: value.createdAt,
      updatedAt: formatted.clone(),
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
  pub isCompleted: bool,
  pub priority: PriorityTask,
  pub startDate: String,
  pub endDate: String,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}
