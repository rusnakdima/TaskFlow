/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl Entity for ChatEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("chats")
  }

  fn get_id(&self) -> Option<String> {
    self.id.clone()
  }

  fn set_id(&mut self, id: String) {
    self.id = Some(id);
  }

  fn is_soft_deletable() -> bool {
    true
  }
}

impl SoftDeletable for ChatEntity {
  fn deleted_at(&self) -> Option<DateTime<Utc>> {
    self.deleted_at
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deleted_at = deleted_at;
  }
}

impl WithRelations for ChatEntity {
  fn relations() -> Vec<RelationDef> {
    vec![RelationDef::many_to_one("todo", "todos", "todo_id")]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ChatCreateModel {
  #[validate(not_empty)]
  pub todo_id: String,
  #[validate(not_empty)]
  pub user_id: String,
  pub author_name: String,
  #[validate(not_empty)]
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
  #[validate(not_empty)]
  pub content: String,
}
