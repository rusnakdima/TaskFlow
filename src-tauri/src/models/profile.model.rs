/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileModel {
  pub _id: ObjectId,
  pub id: String,
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub userId: String,
  pub createdAt: String,
  pub updatedAt: String,
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

impl From<ProfileCreateModel> for ProfileModel {
  fn from(value: ProfileCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    ProfileModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      name: value.name,
      lastName: value.lastName,
      bio: value.bio,
      imageUrl: value.imageUrl,
      userId: value.userId,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileUpdateModel {
  pub _id: Option<ObjectId>,
  pub id: String,
  pub name: Option<String>,
  pub lastName: Option<String>,
  pub bio: Option<String>,
  pub imageUrl: Option<String>,
  pub userId: Option<String>,
  pub createdAt: Option<String>,
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

impl From<ProfileUpdateModel> for ProfileModel {
  fn from(value: ProfileUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    ProfileModel {
      _id: value._id.unwrap_or_else(ObjectId::new),
      id: value.id,
      name: value.name.unwrap_or_default(),
      lastName: value.lastName.unwrap_or_default(),
      bio: value.bio.unwrap_or_default(),
      imageUrl: value.imageUrl.unwrap_or_default(),
      userId: value.userId.unwrap_or_default(),
      createdAt: value.createdAt.unwrap_or_default(),
      updatedAt: formatted,
    }
  }
}
