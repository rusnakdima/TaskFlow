/* sys lib */
use nosql_orm::Validate;
use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct LoginForm {
  #[validate(not_empty)]
  pub username: String,
  #[validate(not_empty)]
  pub password: String,
  pub remember: bool,
}
