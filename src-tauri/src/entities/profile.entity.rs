/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileEntity {
  pub id: Option<String>,
  pub name: String,
  pub last_name: String,
  pub bio: String,
  pub image_url: String,
  pub user_id: String,
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
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

impl WithRelations for ProfileEntity {
  fn relations() -> Vec<RelationDef> {
    vec![RelationDef::many_to_one("user", "users", "user_id")]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileCreateModel {
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub last_name: Option<String>,
  #[serde(default)]
  pub bio: Option<String>,
  #[serde(default)]
  pub image_url: Option<String>,
  pub user_id: String,
}

impl Validatable for ProfileCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.name.as_ref().map_or(true, |s| s.is_empty()) {
      return Err("name cannot be empty".to_string());
    }
    if self.user_id.is_empty() {
      return Err("user_id cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<ProfileCreateModel> for ProfileEntity {
  fn from(value: ProfileCreateModel) -> Self {
    let now = Utc::now();

    ProfileEntity {
      id: None,
      name: value.name.unwrap_or_default(),
      last_name: value.last_name.unwrap_or_default(),
      bio: value.bio.unwrap_or_default(),
      image_url: value.image_url.unwrap_or_default(),
      user_id: value.user_id,
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
  pub last_name: Option<String>,
  #[serde(default)]
  pub bio: Option<String>,
  #[serde(default)]
  pub image_url: Option<String>,
  #[serde(default)]
  pub user_id: Option<String>,
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
