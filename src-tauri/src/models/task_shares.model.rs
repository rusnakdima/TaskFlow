/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::{task_model::TaskFullModel, user_model::UserFullModel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TaskSharesCreateModel {
  pub taskId: String,
  pub userId: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TaskSharesModel {
  pub _id: ObjectId,
  pub id: String,
  pub taskId: String,
  pub userId: String,
}

impl From<TaskSharesCreateModel> for TaskSharesModel {
  fn from(value: TaskSharesCreateModel) -> Self {
    TaskSharesModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      taskId: value.taskId,
      userId: value.userId,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
#[allow(unused)]
pub struct TaskSharesFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub task: TaskFullModel,
  pub user: UserFullModel,
}
