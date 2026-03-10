use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatModel {
  #[serde(default)]
  pub _id: Option<ObjectId>,
  #[serde(default)]
  pub id: Option<String>,
  pub todoId: String,
  pub userId: String,
  pub authorName: String,
  pub content: String,
  pub createdAt: String,
  pub updatedAt: String,
  #[serde(default)]
  pub isDeleted: bool,
  #[serde(default)]
  pub readBy: Vec<String>,
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

impl From<ChatCreateModel> for ChatModel {
  fn from(create: ChatCreateModel) -> Self {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    Self {
      _id: Some(ObjectId::new()),
      id: Some(Uuid::new().to_string()),
      todoId: create.todoId,
      userId: create.userId.clone(),
      authorName: create.authorName,
      content: create.content,
      createdAt: now.clone(),
      updatedAt: now,
      isDeleted: false,
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
