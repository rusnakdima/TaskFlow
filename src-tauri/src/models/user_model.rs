/* sys lib */
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct UserModel {
  #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
  pub id: Option<ObjectId>,
  pub email: String,
  pub username: String,
  pub password: String,
  pub role: String,
  pub resetToken: String,
  pub prodileId: String,
  pub createdAt: String,
  pub updatedAt: String,
}
