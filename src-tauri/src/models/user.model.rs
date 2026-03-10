/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserModel {
  pub _id: ObjectId,
  pub id: String,
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporaryCode: String,
  #[serde(default)]
  pub codeExpiresAt: String,
  pub profileId: String,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCreateModel {
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  #[serde(default)]
  pub temporaryCode: String,
  #[serde(default)]
  pub codeExpiresAt: String,
  pub profileId: String,
}

impl Validatable for UserCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.email.is_empty() {
      return Err("email cannot be empty".to_string());
    }
    if self.username.is_empty() {
      return Err("username cannot be empty".to_string());
    }
    if self.password.is_empty() {
      return Err("password cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<UserCreateModel> for UserModel {
  fn from(value: UserCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    UserModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      email: value.email,
      username: value.username,
      password: value.password,
      role: value.role,
      temporaryCode: value.temporaryCode,
      codeExpiresAt: value.codeExpiresAt,
      profileId: value.profileId,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserUpdateModel {
  pub _id: Option<ObjectId>,
  pub id: String,
  pub email: Option<String>,
  pub username: Option<String>,
  pub password: Option<String>,
  pub role: Option<String>,
  #[serde(default)]
  pub temporaryCode: Option<String>,
  #[serde(default)]
  pub codeExpiresAt: Option<String>,
  pub profileId: Option<String>,
  pub createdAt: Option<String>,
  pub updatedAt: Option<String>,
}

impl Validatable for UserUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref email) = self.email {
      if email.is_empty() {
        return Err("email cannot be empty".to_string());
      }
    }
    if let Some(ref username) = self.username {
      if username.is_empty() {
        return Err("username cannot be empty".to_string());
      }
    }
    Ok(())
  }
}

impl From<UserUpdateModel> for UserModel {
  fn from(value: UserUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    UserModel {
      _id: value._id.unwrap_or_else(ObjectId::new),
      id: value.id,
      email: value.email.unwrap_or_default(),
      username: value.username.unwrap_or_default(),
      password: value.password.unwrap_or_default(),
      role: value.role.unwrap_or_default(),
      temporaryCode: value.temporaryCode.unwrap_or_default(),
      codeExpiresAt: value.codeExpiresAt.unwrap_or_default(),
      profileId: value.profileId.unwrap_or_default(),
      createdAt: value.createdAt.unwrap_or_default(),
      updatedAt: formatted,
    }
  }
}
