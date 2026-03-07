/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]

pub struct CategoryCreateModel {
  pub title: String,
  pub userId: String,
}

impl CategoryCreateModel {
  pub fn validate(&self) -> Result<(), String> {
    if self.title.is_empty() {
      return Err("title cannot be empty".to_string());
    }
    if self.userId.is_empty() {
      return Err("userId cannot be empty".to_string());
    }
    Ok(())
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]

pub struct CategoryModel {
  pub _id: ObjectId,
  pub id: String,
  pub title: String,
  pub userId: String,
  pub isDeleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryUpdateModel {
  pub title: Option<String>,
  pub userId: Option<String>,
  pub isDeleted: Option<bool>,
}

impl CategoryUpdateModel {
  pub fn validate(&self) -> Result<(), String> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err("title cannot be empty".to_string());
      }
    }
    Ok(())
  }
}

impl From<CategoryCreateModel> for CategoryModel {
  fn from(value: CategoryCreateModel) -> Self {
    CategoryModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      title: value.title,
      userId: value.userId,
      isDeleted: false,
    }
  }
}
