/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("subtasks")]
#[soft_delete]
#[one_to_many("comments", "comments", "subtask_id", "Cascade")]
pub struct SubtaskEntity {
  pub id: Option<String>,
  #[validate(required)]
  pub task_id: String,
  #[validate(not_empty)]
  #[validate(length(min = 1, max = 200))]
  pub title: String,
  #[validate(length(max = 3000))]
  pub description: String,
  pub status: crate::entities::task_entity::TaskStatus,
  #[validate(not_empty)]
  #[validate(pattern("^(low|medium|high)$"))]
  pub priority: String,
  #[validate(range(min = 0, max = 9999))]
  pub order: i32,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct SubtaskCreateModel {
  #[validate(required)]
  #[validate(not_empty)]
  pub task_id: String,
  #[validate(not_empty)]
  #[validate(length(min = 1, max = 200))]
  pub title: String,
  pub description: Option<String>,
  #[validate(not_empty)]
  #[validate(pattern("^(low|medium|high)$"))]
  pub priority: String,
  #[validate(range(min = 0, max = 9999))]
  pub order: i32,
}

impl From<SubtaskCreateModel> for SubtaskEntity {
  fn from(value: SubtaskCreateModel) -> Self {
    let now = Utc::now();

    SubtaskEntity {
      id: None,
      task_id: value.task_id,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: crate::entities::task_entity::TaskStatus::Pending,
      priority: value.priority,
      order: value.order,
      deleted_at: None,
      created_at: Some(now),
      updated_at: Some(now),
      start_date: None,
      end_date: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct SubtaskUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub task_id: Option<String>,
  #[validate(length(min = 1, max = 200))]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub status: Option<crate::entities::task_entity::TaskStatus>,
  #[validate(not_empty)]
  pub priority: Option<String>,
  #[serde(default)]
  pub order: Option<i32>,
  #[serde(default)]
  pub deleted_at: Option<bool>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub comments: Option<Vec<crate::entities::comment_entity::CommentEntity>>,
}
