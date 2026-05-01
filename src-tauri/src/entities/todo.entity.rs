/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("todos")]
#[soft_delete]
#[timestamp]
#[one_to_many("tasks", "tasks", "todo_id", "Cascade")]
#[one_to_many("chats", "chats", "todo_id", "Cascade")]
#[many_to_one("user", "users", "user_id")]
#[many_to_many("categories", "categories", "categories")]
#[many_to_many("assignees", "profiles", "assignees")]
#[index("user_id", 1)]
#[index("status", 1)]
#[index("priority", 1)]
#[index("visibility", 1)]
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
  pub visibility: String,
  pub priority: String,
  pub order: i32,
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
  #[validate(not_empty)]
  pub visibility: String,
  pub priority: String,
  pub order: i32,
}

impl From<TodoCreateModel> for TodoEntity {
  fn from(value: TodoCreateModel) -> Self {
    let now = Utc::now();
    let formatted_start_date = if value.start_date.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.start_date) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };
    let formatted_end_date = if value.end_date.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.end_date) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };

    TodoEntity {
      id: None,
      user_id: value.user_id,
      title: value.title,
      description: Some(value.description),
      start_date: formatted_start_date,
      end_date: formatted_end_date,
      categories: value.categories,
      assignees: value.assignees,
      visibility: value.visibility,
      priority: value.priority,
      order: value.order,
      deleted_at: None,
      created_at: Some(now),
      updated_at: Some(now),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct TodoUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub user_id: Option<String>,
  #[validate(length(min = 1, max = 200))]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub start_date: Option<String>,
  #[serde(default)]
  pub end_date: Option<String>,
  #[serde(default)]
  pub categories: Option<Vec<String>>,
  #[serde(default)]
  pub assignees: Option<Vec<String>>,
  #[validate(not_empty)]
  pub visibility: Option<String>,
  #[serde(default)]
  pub priority: Option<String>,
  #[serde(default)]
  pub order: Option<i32>,
  #[serde(default)]
  pub deleted_at: Option<bool>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
}
