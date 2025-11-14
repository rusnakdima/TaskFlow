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
  pub order: i32,
  pub isDeleted: bool,
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
  pub order: i32,
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
      order: value.order,
      isDeleted: false,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskUpdateModel {
  pub _id: Option<ObjectId>,
  pub id: String,
  pub taskId: Option<String>,
  pub title: Option<String>,
  pub description: Option<String>,
  pub isCompleted: Option<bool>,
  pub priority: Option<String>,
  pub order: Option<i32>,
  pub isDeleted: Option<bool>,
  pub createdAt: Option<String>,
  pub updatedAt: String,
}

#[allow(non_snake_case)]
impl SubtaskUpdateModel {
  pub fn applyTo(&self, existing: SubtaskModel) -> SubtaskModel {
    SubtaskModel {
      _id: existing._id,
      id: existing.id,
      taskId: self.taskId.clone().unwrap_or(existing.taskId),
      title: self.title.clone().unwrap_or(existing.title),
      description: self.description.clone().unwrap_or(existing.description),
      isCompleted: self.isCompleted.unwrap_or(existing.isCompleted),
      priority: self.priority.clone().unwrap_or(existing.priority),
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
pub struct SubtaskFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub task: TaskFullModel,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: PriorityTask,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}
