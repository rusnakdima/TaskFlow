/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;

/* helpers */
use crate::helpers::{common::format_date, timestamp_helper::get_current_datetime};

#[derive(Debug, Serialize, Deserialize, Model)]
#[table_name("todos")]
#[soft_delete]
#[timestamp]
#[one_to_many("tasks", "tasks", "todo_id", "Cascade")]
#[many_to_one("user", "users", "user_id")]
#[many_to_many("categories", "categories", "categories")]
#[many_to_many("assignees", "profiles", "assignees")]
#[index("user_id", 1)]
#[index("status", 1)]
#[index("priority", 1)]
#[index("visibility", 1)]
#[index("github_repo_id", 1)]
#[frontend_exclude("tasks", "user")]
pub struct TodoEntity {
  pub id: Option<String>,
  pub user_id: String,
  pub title: String,
  pub description: Option<String>,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub assignee_roles: HashMap<String, String>,
  pub visibility: String,
  pub priority: String,
  pub order: i32,
  pub github_repo_id: Option<String>,
  pub github_repo_name: Option<String>,
  pub tasks_count: i32,
  pub completed_tasks_count: i32,
  pub created_at: Option<DateTime<Utc>>,
  pub updated_at: Option<DateTime<Utc>>,
  pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct TodoCreateModel {
  #[validate(not_empty)]
  pub user_id: String,
  #[validate(not_empty)]
  pub title: String,
  pub description: String,
  pub start_date: String,
  pub end_date: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  #[serde(default)]
  pub assignee_roles: Option<HashMap<String, String>>,
  #[validate(not_empty)]
  pub visibility: String,
  pub priority: String,
  pub order: i32,
  pub github_repo_id: Option<String>,
  pub github_repo_name: Option<String>,
}

impl From<TodoCreateModel> for TodoEntity {
  fn from(value: TodoCreateModel) -> Self {
    let now = get_current_datetime();
    let formatted_start_date = format_date(&value.start_date);
    let formatted_end_date = format_date(&value.end_date);

    TodoEntity {
      id: None,
      user_id: value.user_id,
      title: value.title,
      description: Some(value.description),
      start_date: formatted_start_date,
      end_date: formatted_end_date,
      categories: value.categories,
      assignees: value.assignees,
      assignee_roles: value.assignee_roles.unwrap_or_default(),
      visibility: value.visibility,
      priority: value.priority,
      order: value.order,
      github_repo_id: value.github_repo_id,
      github_repo_name: value.github_repo_name,
      tasks_count: 0,
      completed_tasks_count: 0,
      deleted_at: None,
      created_at: Some(now),
      updated_at: Some(now),
    }
  }
}
