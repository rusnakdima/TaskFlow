/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* helpers */
use crate::helpers::timestamp_helper::get_current_datetime;

/* nosql_orm */
use nosql_orm::{Model, Validate};

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("chats")]
#[soft_delete]
#[timestamp]
#[many_to_one("user", "users", "user_id")]
#[many_to_many("read_by_users", "users", "read_by")]
#[index("user_id", 1)]
pub struct ChatEntity {
  pub id: Option<String>,
  pub user_id: String,
  pub content: String,
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
pub struct ChatCreateModel {
  #[validate(required)]
  pub user_id: String,
  #[validate(required)]
  #[validate(length(min = 1, max = 5000))]
  pub content: String,
}

impl From<ChatCreateModel> for ChatEntity {
  fn from(create: ChatCreateModel) -> Self {
    let now = get_current_datetime();
    ChatEntity {
      id: None,
      user_id: create.user_id.clone(),
      content: create.content,
      created_at: Some(now),
      updated_at: Some(now),
      deleted_at: None,
      read_by: vec![create.user_id],
    }
  }
}
