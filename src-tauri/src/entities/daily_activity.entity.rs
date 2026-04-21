/* sys lib */
use mongodb::bson::Uuid;
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityModel {
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
#[serde(rename_all = "camelCase")]
pub struct DailyActivityCreateModel {
  pub userId: String,
  pub date: String,
}

impl Validatable for DailyActivityCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.userId.is_empty() {
      return Err("userId cannot be empty".to_string());
    }
    if self.date.is_empty() {
      return Err("date cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<DailyActivityCreateModel> for DailyActivityModel {
  fn from(value: DailyActivityCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    DailyActivityModel {
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
      updatedAt: formatted,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityUpdateModel {
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

impl From<DailyActivityUpdateModel> for DailyActivityModel {
  fn from(value: DailyActivityUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    DailyActivityModel {
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