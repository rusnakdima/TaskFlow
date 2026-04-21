/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntity {
  pub id: Option<String>,
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub userId: String,
  pub createdAt: DateTime<Utc>,
  pub updatedAt: DateTime<Utc>,
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
    vec![RelationDef::many_to_one("user", "users", "userId")]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileCreateModel {
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub lastName: Option<String>,
  #[serde(default)]
  pub bio: Option<String>,
  #[serde(default)]
  pub imageUrl: Option<String>,
  pub userId: String,
}

impl Validatable for ProfileCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.name.as_ref().map_or(true, |s| s.is_empty()) {
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
      name: value.name.unwrap_or_default(),
      lastName: value.lastName.unwrap_or_default(),
      bio: value.bio.unwrap_or_default(),
      imageUrl: value.imageUrl.unwrap_or_default(),
      userId: value.userId,
      createdAt: now,
      updatedAt: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
  pub createdAt: Option<String>,
  #[serde(default)]
  pub updatedAt: Option<String>,
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