/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::user_model::UserFullModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DailyActivityModel {
  pub _id: ObjectId,
  pub id: String,
  pub userId: String,
  pub date: String,
  pub todosCreated: i32,
  pub todosUpdated: i32,
  pub todosDeleted: i32,
  pub tasksCreated: i32,
  pub tasksUpdated: i32,
  pub tasksCompleted: i32,
  pub tasksDeleted: i32,
  pub subtasksCreated: i32,
  pub subtasksUpdated: i32,
  pub subtasksCompleted: i32,
  pub subtasksDeleted: i32,
  pub totalActivity: i32,
  pub totalTasks: i32,
  pub completedTasks: i32,
  pub productivityScore: i32,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DailyActivityCreateModel {
  pub userId: String,
  pub date: String,
}

#[allow(non_snake_case)]
impl From<DailyActivityCreateModel> for DailyActivityModel {
  fn from(value: DailyActivityCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    DailyActivityModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      userId: value.userId,
      date: value.date,
      todosCreated: 0,
      todosUpdated: 0,
      todosDeleted: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksCompleted: 0,
      tasksDeleted: 0,
      subtasksCreated: 0,
      subtasksUpdated: 0,
      subtasksCompleted: 0,
      subtasksDeleted: 0,
      totalActivity: 0,
      totalTasks: 0,
      completedTasks: 0,
      productivityScore: 0,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DailyActivityUpdateModel {
  pub _id: ObjectId,
  pub id: String,
  pub userId: String,
  pub date: String,
  pub todosCreated: i32,
  pub todosUpdated: i32,
  pub todosDeleted: i32,
  pub tasksCreated: i32,
  pub tasksUpdated: i32,
  pub tasksCompleted: i32,
  pub tasksDeleted: i32,
  pub subtasksCreated: i32,
  pub subtasksUpdated: i32,
  pub subtasksCompleted: i32,
  pub subtasksDeleted: i32,
  pub totalActivity: i32,
  pub totalTasks: i32,
  pub completedTasks: i32,
  pub productivityScore: i32,
  pub createdAt: String,
  pub updatedAt: String,
}

#[allow(non_snake_case)]
impl From<DailyActivityUpdateModel> for DailyActivityModel {
  fn from(value: DailyActivityUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    DailyActivityModel {
      _id: value._id,
      id: value.id,
      userId: value.userId,
      date: value.date,
      todosCreated: value.todosCreated,
      todosUpdated: value.todosUpdated,
      todosDeleted: value.todosDeleted,
      tasksCreated: value.tasksCreated,
      tasksUpdated: value.tasksUpdated,
      tasksCompleted: value.tasksCompleted,
      tasksDeleted: value.tasksDeleted,
      subtasksCreated: value.subtasksCreated,
      subtasksUpdated: value.subtasksUpdated,
      subtasksCompleted: value.subtasksCompleted,
      subtasksDeleted: value.subtasksDeleted,
      totalActivity: value.totalActivity,
      totalTasks: value.totalTasks,
      completedTasks: value.completedTasks,
      productivityScore: value.productivityScore,
      createdAt: value.createdAt,
      updatedAt: formatted,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
#[allow(unused)]
pub struct DailyActivityFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub user: UserFullModel,
  pub date: String,
  pub todosCreated: i32,
  pub todosUpdated: i32,
  pub todosDeleted: i32,
  pub tasksCreated: i32,
  pub tasksUpdated: i32,
  pub tasksCompleted: i32,
  pub tasksDeleted: i32,
  pub subtasksCreated: i32,
  pub subtasksUpdated: i32,
  pub subtasksCompleted: i32,
  pub subtasksDeleted: i32,
  pub totalActivity: i32,
  pub totalTasks: i32,
  pub completedTasks: i32,
  pub productivityScore: i32,
  pub createdAt: String,
  pub updatedAt: String,
}
