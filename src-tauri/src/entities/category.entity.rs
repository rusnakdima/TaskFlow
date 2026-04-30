/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("categories")]
#[many_to_one("user", "users", "user_id")]
#[soft_delete]
#[timestamp]
#[index("user_id", 1)]
#[Relations(todos)]
pub struct CategoryEntity {
  pub id: Option<String>,
  pub title: String,
  pub user_id: String,
  #[serde(default)]
  pub created_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub updated_at: Option<DateTime<Utc>>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CategoryCreateModel {
  #[validate(not_empty)]
  #[validate(length(min = 1, max = 100))]
  pub title: String,
  #[validate(not_empty)]
  pub user_id: String,
}

impl From<CategoryCreateModel> for CategoryEntity {
  fn from(value: CategoryCreateModel) -> Self {
    let now = Utc::now();
    CategoryEntity {
      id: None,
      title: value.title,
      user_id: value.user_id,
      deleted_at: None,
      created_at: Some(now),
      updated_at: Some(now),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CategoryUpdateModel {
  #[validate(length(max = 100))]
  pub title: Option<String>,
  pub user_id: Option<String>,
  pub deleted_at: Option<bool>,
}
