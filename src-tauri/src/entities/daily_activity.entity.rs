/* sys lib */
use mongodb::bson::Uuid;
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityModel {
  pub id: String,
  pub user_id: String,
  pub date: String,
  pub todos_created: i32,
  pub todos_updated: i32,
  pub todos_deleted: i32,
  pub tasks_created: i32,
  pub tasks_updated: i32,
  pub tasks_completed: i32,
  pub tasks_deleted: i32,
  pub subtasks_created: i32,
  pub subtasks_updated: i32,
  pub subtasks_completed: i32,
  pub subtasks_deleted: i32,
  pub total_activity: i32,
  pub total_tasks: i32,
  pub completed_tasks: i32,
  pub productivity_score: i32,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityCreateModel {
  pub user_id: String,
  pub date: String,
}

impl Validatable for DailyActivityCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.user_id.is_empty() {
      return Err("user_id cannot be empty".to_string());
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
      user_id: value.user_id,
      date: value.date,
      todos_created: 0,
      todos_updated: 0,
      todos_deleted: 0,
      tasks_created: 0,
      tasks_updated: 0,
      tasks_completed: 0,
      tasks_deleted: 0,
      subtasks_created: 0,
      subtasks_updated: 0,
      subtasks_completed: 0,
      subtasks_deleted: 0,
      total_activity: 0,
      total_tasks: 0,
      completed_tasks: 0,
      productivity_score: 0,
      created_at: formatted.clone(),
      updated_at: formatted,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityUpdateModel {
  pub id: String,
  pub user_id: String,
  pub date: String,
  pub todos_created: i32,
  pub todos_updated: i32,
  pub todos_deleted: i32,
  pub tasks_created: i32,
  pub tasks_updated: i32,
  pub tasks_completed: i32,
  pub tasks_deleted: i32,
  pub subtasks_created: i32,
  pub subtasks_updated: i32,
  pub subtasks_completed: i32,
  pub subtasks_deleted: i32,
  pub total_activity: i32,
  pub total_tasks: i32,
  pub completed_tasks: i32,
  pub productivity_score: i32,
  pub created_at: String,
  pub updated_at: String,
}

impl From<DailyActivityUpdateModel> for DailyActivityModel {
  fn from(value: DailyActivityUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    DailyActivityModel {
      id: value.id,
      user_id: value.user_id,
      date: value.date,
      todos_created: value.todos_created,
      todos_updated: value.todos_updated,
      todos_deleted: value.todos_deleted,
      tasks_created: value.tasks_created,
      tasks_updated: value.tasks_updated,
      tasks_completed: value.tasks_completed,
      tasks_deleted: value.tasks_deleted,
      subtasks_created: value.subtasks_created,
      subtasks_updated: value.subtasks_updated,
      subtasks_completed: value.subtasks_completed,
      subtasks_deleted: value.subtasks_deleted,
      total_activity: value.total_activity,
      total_tasks: value.total_tasks,
      completed_tasks: value.completed_tasks,
      productivity_score: value.productivity_score,
      created_at: value.created_at,
      updated_at: formatted,
    }
  }
}
