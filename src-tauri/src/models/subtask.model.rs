/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::task_model::{PriorityTask, TaskFullModel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskModel {
  pub _id: ObjectId,
  pub id: String,
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: String,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskCreateModel {
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: String,
}

impl From<SubtaskCreateModel> for SubtaskModel {
  fn from(value: SubtaskCreateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

    SubtaskModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      taskId: value.taskId,
      title: value.title,
      description: value.description,
      isCompleted: false,
      priority: value.priority.to_string(),
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskUpdateModel {
  pub _id: ObjectId,
  pub id: String,
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: String,
  pub createdAt: String,
  pub updatedAt: String,
}

impl From<SubtaskUpdateModel> for SubtaskModel {
  fn from(value: SubtaskUpdateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

    SubtaskModel {
      _id: value._id,
      id: value.id,
      taskId: value.taskId,
      title: value.title,
      description: value.description,
      isCompleted: value.isCompleted,
      priority: value.priority.to_string(),
      createdAt: value.createdAt,
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub task: TaskFullModel,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: PriorityTask,
  pub createdAt: String,
  pub updatedAt: String,
}
