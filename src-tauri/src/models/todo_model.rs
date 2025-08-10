/* sys lib */
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

/* models */
use crate::models::{
  category_model::CategoryFullModel, task_model::TaskFullModel, user_model::UserFullModel,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoModel {
  pub _id: ObjectId,
  pub id: String,
  pub userId: String,
  pub title: String,
  pub description: String,
  pub categories: Vec<String>,
  pub isCompleted: bool,
  pub assignees: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub user: UserFullModel,
  pub title: String,
  pub description: String,
  pub categories: Vec<CategoryFullModel>,
  pub isCompleted: bool,
  pub tasks: Vec<TaskFullModel>,
  pub assignees: Vec<UserFullModel>,
}
