/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::{task_model::TaskFullModel, user_model::UserFullModel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TaskSharesModel {
  pub _id: ObjectId,
  pub id: Uuid,
  pub taskId: String,
  pub userId: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TaskSharesFullModel {
  pub _id: ObjectId,
  pub id: Uuid,
  pub task: TaskFullModel,
  pub user: UserFullModel,
}
