/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use nosql_orm::prelude::SoftDeletable;
use nosql_orm::{Model, Validate};

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("chats")]
#[soft_delete]
pub struct ChatEntity {
  pub id: Option<String>,
  pub todo_id: String,
  pub user_id: String,
  pub author_name: String,
  pub content: String,
  #[serde(default)]
  pub read_by: Vec<String>,
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

impl SoftDeletable for ChatEntity {
  fn deleted_at(&self) -> Option<DateTime<Utc>> {
    self.deleted_at
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deleted_at = deleted_at;
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ChatCreateModel {
  #[validate(required)]
  pub todo_id: String,
  #[validate(required)]
  pub user_id: String,
  pub author_name: String,
  #[validate(required)]
  #[validate(length(min = 1, max = 5000))]
  pub content: String,
}

impl From<ChatCreateModel> for ChatEntity {
  fn from(create: ChatCreateModel) -> Self {
    let now = Utc::now();
    ChatEntity {
      id: None,
      todo_id: create.todo_id,
      user_id: create.user_id.clone(),
      author_name: create.author_name,
      content: create.content,
      created_at: now,
      updated_at: now,
      deleted_at: None,
      read_by: vec![create.user_id],
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ChatUpdateModel {
  #[validate(required)]
  #[validate(length(min = 1, max = 5000))]
  pub content: String,
}
