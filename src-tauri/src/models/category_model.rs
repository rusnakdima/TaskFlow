/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::user_model::UserFullModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CategoryModel {
  pub _id: ObjectId,
  pub id: Uuid,
  pub title: String,
  pub userId: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CategoryFullModel {
  pub _id: ObjectId,
  pub id: Uuid,
  pub title: String,
  pub user: UserFullModel,
}
