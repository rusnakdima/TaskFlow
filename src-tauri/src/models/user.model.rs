/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::profile_model::ProfileFullModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
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
#[allow(non_snake_case)]
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
#[allow(non_snake_case)]
pub struct UserUpdateModel {
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

impl From<UserUpdateModel> for UserModel {
  fn from(value: UserUpdateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    UserModel {
      _id: value._id,
      id: value.id,
      email: value.email,
      username: value.username,
      password: value.password,
      role: value.role,
      temporaryCode: value.temporaryCode,
      codeExpiresAt: value.codeExpiresAt,
      profileId: value.profileId,
      createdAt: value.createdAt,
      updatedAt: formatted,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct UserFullModel {
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
  pub profile: ProfileFullModel,
  pub createdAt: String,
  pub updatedAt: String,
}
