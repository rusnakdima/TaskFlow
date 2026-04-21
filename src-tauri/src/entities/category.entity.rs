/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryEntity {
  pub id: Option<String>,
  pub title: String,
  pub userId: String,
  pub deletedAt: Option<DateTime<Utc>>,
  pub createdAt: DateTime<Utc>,
  pub updatedAt: DateTime<Utc>,
}

impl Entity for CategoryEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("categories")
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCreateModel {
  pub title: String,
  pub userId: String,
}

impl Validatable for CategoryCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.title.is_empty() {
      return Err("title cannot be empty".to_string());
    }
    if self.userId.is_empty() {
      return Err("userId cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<CategoryCreateModel> for CategoryEntity {
  fn from(value: CategoryCreateModel) -> Self {
    let now = Utc::now();
    CategoryEntity {
      id: None,
      title: value.title,
      userId: value.userId,
      deletedAt: None,
      createdAt: now,
      updatedAt: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryUpdateModel {
  pub title: Option<String>,
  pub userId: Option<String>,
  pub deletedAt: Option<bool>,
}

impl Validatable for CategoryUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err("title cannot be empty".to_string());
      }
    }
    Ok(())
  }
}