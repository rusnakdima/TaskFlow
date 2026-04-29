/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("comments")]
#[many_to_one("user", "users", "user_id")]
#[many_to_one("task", "tasks", "task_id")]
#[many_to_one("subtask", "subtasks", "subtask_id")]
#[many_to_one_array("read_by_users", "users", "read_by")]
#[timestamp]
#[soft_delete]
#[index("user_id", 1)]
pub struct CommentEntity {
  pub id: Option<String>,
  pub user_id: String,
  pub content: String,
  #[serde(default)]
  pub task_id: Option<String>,
  #[serde(default)]
  pub subtask_id: Option<String>,
  #[serde(default)]
  pub read_by: Vec<String>,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[validate(xor("task_id", "subtask_id"))]
pub struct CommentCreateModel {
  #[validate(required)]
  pub user_id: String,
  #[validate(required)]
  #[validate(length(max = 5000))]
  pub content: String,
  pub task_id: Option<String>,
  pub subtask_id: Option<String>,
}

impl From<CommentCreateModel> for CommentEntity {
  fn from(value: CommentCreateModel) -> Self {
    let now = Utc::now();

    CommentEntity {
      id: None,
      user_id: value.user_id,
      content: value.content,
      created_at: Some(now),
      updated_at: Some(now),
      task_id: value.task_id,
      subtask_id: value.subtask_id,
      read_by: vec![],
      deleted_at: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CommentUpdateModel {
  #[serde(default)]
  #[validate(length(max = 5000))]
  pub content: Option<String>,
  #[serde(default)]
  pub read_by: Option<Vec<String>>,
  #[serde(default)]
  pub updated_at: Option<String>,
}
