/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::{category_model::CategoryFullModel, user_model::UserFullModel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoModel {
  pub _id: ObjectId,
  pub id: String,
  pub userId: String,
  pub title: String,
  pub description: String,
  pub deadline: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoCreateModel {
  pub userId: String,
  pub title: String,
  pub description: String,
  pub deadline: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
}

#[allow(non_snake_case)]
impl From<TodoCreateModel> for TodoModel {
  fn from(value: TodoCreateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
    let formattedDeadline = chrono::DateTime::parse_from_rfc3339(&value.deadline)
      .unwrap()
      .to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

    TodoModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      userId: value.userId,
      title: value.title,
      description: value.description,
      deadline: formattedDeadline,
      categories: value.categories,
      assignees: value.assignees,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoUpdateModel {
  pub _id: ObjectId,
  pub id: String,
  pub userId: String,
  pub title: String,
  pub description: String,
  pub deadline: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub createdAt: String,
  pub updatedAt: String,
}

#[allow(non_snake_case)]
impl From<TodoUpdateModel> for TodoModel {
  fn from(value: TodoUpdateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
    let formattedDeadline = chrono::DateTime::parse_from_rfc3339(&value.deadline)
      .unwrap()
      .to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

    TodoModel {
      _id: value._id,
      id: value.id,
      userId: value.userId,
      title: value.title,
      description: value.description,
      deadline: formattedDeadline,
      categories: value.categories,
      assignees: value.assignees,
      createdAt: value.createdAt,
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub user: UserFullModel,
  pub title: String,
  pub description: String,
  pub deadline: String,
  pub categories: Vec<CategoryFullModel>,
  pub assignees: Vec<UserFullModel>,
  pub createdAt: String,
  pub updatedAt: String,
}
