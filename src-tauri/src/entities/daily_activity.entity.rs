/* sys lib */
use chrono::{DateTime, Utc};
use nosql_orm::Model;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("daily_activities")]
#[many_to_one("user", "users", "user_id")]
#[timestamp]
#[index("user_id", 1)]
#[index("date", 1)]
pub struct DailyActivityModel {
  pub id: Option<String>,
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
  pub total_creates: i32,
  pub total_updates: i32,
  pub total_deletes: i32,
  pub total_activity: i32,
  pub total_tasks: i32,
  pub completed_tasks: i32,
  pub productivity_score: i32,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
}
#[derive(Debug, Clone, Serialize, Deserialize, nosql_orm::Validate)]
#[serde(rename_all = "snake_case")]
pub struct DailyActivityCreateModel {
  #[validate(required)]
  pub user_id: String,
  #[validate(required)]
  pub date: String,
}
impl From<DailyActivityCreateModel> for DailyActivityModel {
  fn from(value: DailyActivityCreateModel) -> Self {
    DailyActivityModel {
      id: Some(nosql_orm::utils::generate_id()),
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
      total_creates: 0,
      total_updates: 0,
      total_deletes: 0,
      total_activity: 0,
      total_tasks: 0,
      completed_tasks: 0,
      productivity_score: 0,
      created_at: None,
      updated_at: None,
    }
  }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
  pub total_creates: i32,
  pub total_updates: i32,
  pub total_deletes: i32,
  pub total_activity: i32,
  pub total_tasks: i32,
  pub completed_tasks: i32,
  pub productivity_score: i32,
  pub created_at: String,
  pub updated_at: String,
}
impl From<DailyActivityUpdateModel> for DailyActivityModel {
  fn from(value: DailyActivityUpdateModel) -> Self {
    DailyActivityModel {
      id: Some(value.id),
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
      total_creates: value.total_creates,
      total_updates: value.total_updates,
      total_deletes: value.total_deletes,
      total_activity: value.total_activity,
      total_tasks: value.total_tasks,
      completed_tasks: value.completed_tasks,
      productivity_score: value.productivity_score,
      created_at: None,
      updated_at: None,
    }
  }
}
