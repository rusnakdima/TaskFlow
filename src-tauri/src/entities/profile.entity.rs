/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;
#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("profiles")]
#[one_to_one("user", "users", "user_id")]
#[timestamp]
#[index("user_id", 1)]
pub struct ProfileEntity {
  pub id: Option<String>,
  pub name: String,
  pub last_name: String,
  pub bio: String,
  pub image_url: String,
  pub original_image_url: String,
  pub user_id: String,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ProfileCreateModel {
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub last_name: Option<String>,
  #[serde(default)]
  pub bio: Option<String>,
  #[serde(default)]
  pub image_url: Option<String>,
  #[serde(default)]
  pub original_image_url: Option<String>,
  #[validate(not_empty)]
  pub user_id: String,
}
impl From<ProfileCreateModel> for ProfileEntity {
  fn from(value: ProfileCreateModel) -> Self {
    ProfileEntity {
      id: None,
      name: value.name.unwrap_or_default(),
      last_name: value.last_name.unwrap_or_default(),
      bio: value.bio.unwrap_or_default(),
      image_url: value.image_url.unwrap_or_default(),
      original_image_url: value.original_image_url.unwrap_or_default(),
      user_id: value.user_id,
      created_at: None,
      updated_at: None,
    }
  }
}
