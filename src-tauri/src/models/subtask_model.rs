/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::task_model::TaskFullModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub enum PriorityTask {
  Low,
  Medium,
  High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskModel {
  pub _id: ObjectId,
  pub id: Uuid,
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: PriorityTask,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct SubtaskFullModel {
  pub _id: ObjectId,
  pub id: Uuid,
  pub taskId: TaskFullModel,
  pub title: String,
  pub description: String,
  pub isCompleted: bool,
  pub priority: PriorityTask,
  pub createdAt: String,
  pub updatedAt: String,
}
