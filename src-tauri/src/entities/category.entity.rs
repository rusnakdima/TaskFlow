/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryEntity {
  pub id: Option<String>,
  pub title: String,
  pub user_id: String,
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
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
pub struct CategoryCreateModel {
  pub title: String,
  pub user_id: String,
}

impl Validatable for CategoryCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.title.is_empty() {
      return Err("title cannot be empty".to_string());
    }
    if self.user_id.is_empty() {
      return Err("user_id cannot be empty".to_string());
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
      user_id: value.user_id,
      deleted_at: None,
      created_at: now,
      updated_at: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryUpdateModel {
  pub title: Option<String>,
  pub user_id: Option<String>,
  pub deleted_at: Option<bool>,
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
