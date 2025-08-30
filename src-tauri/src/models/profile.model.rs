/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::user_model::UserModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
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
#[allow(non_snake_case)]
pub struct ProfileCreateModel {
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub userId: String,
}

impl From<ProfileCreateModel> for ProfileModel {
  fn from(value: ProfileCreateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

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
#[allow(non_snake_case)]
pub struct ProfileUpdateModel {
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

impl From<ProfileUpdateModel> for ProfileModel {
  fn from(value: ProfileUpdateModel) -> Self {
    let now = chrono::Local::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

    ProfileModel {
      _id: value._id,
      id: value.id,
      name: value.name,
      lastName: value.lastName,
      bio: value.bio,
      imageUrl: value.imageUrl,
      userId: value.userId,
      createdAt: value.createdAt,
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ProfileFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub user: UserModel,
}
