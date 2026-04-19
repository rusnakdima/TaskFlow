use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatEntity {
  pub id: Option<String>,
  pub todoId: String,
  pub userId: String,
  pub authorName: String,
  pub content: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub readBy: Vec<String>,
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
    vec![RelationDef::many_to_one("todo", "todos", "todoId")]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCreateModel {
  pub todoId: String,
  pub userId: String,
  pub authorName: String,
  pub content: String,
}

impl Validatable for ChatCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.todoId.is_empty() {
      return Err("todoId is required".to_string());
    }
    if self.userId.is_empty() {
      return Err("userId is required".to_string());
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
      todoId: create.todoId,
      userId: create.userId.clone(),
      authorName: create.authorName,
      content: create.content,
      created_at: now,
      updated_at: now,
      deleted_at: None,
      readBy: vec![create.userId],
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
