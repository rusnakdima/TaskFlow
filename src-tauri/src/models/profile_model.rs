/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::user_model::UserModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ProfileCreateModel {
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub imageUrl: String,
  pub userId: String,
}

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
}

impl From<ProfileCreateModel> for ProfileModel {
  fn from(value: ProfileCreateModel) -> Self {
    ProfileModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      name: value.name,
      lastName: value.lastName,
      bio: value.bio,
      imageUrl: value.imageUrl,
      userId: value.userId,
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
