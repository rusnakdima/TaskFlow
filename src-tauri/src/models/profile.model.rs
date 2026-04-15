/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileEntity {
  pub id: Option<String>,
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub userId: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl Entity for ProfileEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("profiles")
  }

  fn get_id(&self) -> Option<String> {
    self.id.clone()
  }

  fn set_id(&mut self, id: String) {
    self.id = Some(id);
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileCreateModel {
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub userId: String,
}

impl Validatable for ProfileCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.name.is_empty() {
      return Err("name cannot be empty".to_string());
    }
    if self.userId.is_empty() {
      return Err("userId cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<ProfileCreateModel> for ProfileEntity {
  fn from(value: ProfileCreateModel) -> Self {
    let now = Utc::now();

    ProfileEntity {
      id: None,
      name: value.name,
      lastName: value.lastName,
      bio: value.bio,
      imageUrl: value.imageUrl,
      userId: value.userId,
      created_at: now,
      updated_at: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub lastName: Option<String>,
  #[serde(default)]
  pub bio: Option<String>,
  #[serde(default)]
  pub imageUrl: Option<String>,
  #[serde(default)]
  pub userId: Option<String>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
}

impl Validatable for ProfileUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref name) = self.name {
      if name.is_empty() {
        return Err("name cannot be empty".to_string());
      }
    }
    Ok(())
  }
}
