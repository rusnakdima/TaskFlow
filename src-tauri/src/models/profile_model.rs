/* sys lib */
use mongodb::bson::oid::ObjectId;
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
  pub userId: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ProfileFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub name: String,
  pub lastName: String,
  pub bio: String,
  pub user: UserModel,
}
