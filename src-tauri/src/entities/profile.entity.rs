/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("profiles")]
#[many_to_one("user", "users", "user_id")]
#[timestamp]
#[index("user_id", 1)]
#[Relations(user)]
pub struct ProfileEntity {
  pub id: Option<String>,
  pub name: String,
  pub last_name: String,
  pub bio: String,
  pub image_url: String,
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
  #[validate(not_empty)]
  pub user_id: String,
}

impl From<ProfileCreateModel> for ProfileEntity {
  fn from(value: ProfileCreateModel) -> Self {
    let now = Utc::now();

    ProfileEntity {
      id: None,
      name: value.name.unwrap_or_default(),
      last_name: value.last_name.unwrap_or_default(),
      bio: value.bio.unwrap_or_default(),
      image_url: value.image_url.unwrap_or_default(),
      user_id: value.user_id,
      created_at: Some(now),
      updated_at: Some(now),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ProfileUpdateModel {
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub name: Option<String>,
  #[serde(default)]
  pub last_name: Option<String>,
  #[serde(default)]
  #[validate(length(max = 500))]
  pub bio: Option<String>,
  #[serde(default)]
  pub image_url: Option<String>,
  #[serde(default)]
  pub user_id: Option<String>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
}
