use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEntity {
  pub id: Option<String>,
  pub todo_id: String,
  pub user_id: String,
  pub author_name: String,
  pub content: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub read_by: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCreateModel {
  pub todo_id: String,
  pub user_id: String,
  pub author_name: String,
  pub content: String,
}

impl Validatable for ChatCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.todo_id.is_empty() {
      return Err("todo_id is required".to_string());
    }
    if self.user_id.is_empty() {
      return Err("user_id is required".to_string());
    }
    if self.content.is_empty() {
      return Err("content is required".to_string());
    }
    Ok(())
  }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUpdateModel {
  pub content: String,
}

impl Validatable for ChatUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if self.content.is_empty() {
      return Err("content is required".to_string());
    }
    Ok(())
  }
}
