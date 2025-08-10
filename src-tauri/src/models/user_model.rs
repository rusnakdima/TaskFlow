/* sys lib */
use mongodb::bson::oid::ObjectId;
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
  pub resetToken: String,
  pub prodileId: String,
  pub createdAt: String,
  pub updatedAt: String,
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
  pub resetToken: String,
  pub prodile: ProfileFullModel,
  pub createdAt: String,
  pub updatedAt: String,
}
