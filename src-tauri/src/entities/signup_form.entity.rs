/* sys lib */
use nosql_orm::Validate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct SignupForm {
  #[validate(email)]
  pub email: String,
  #[validate(not_empty)]
  pub username: String,
  #[validate(not_empty)]
  pub password: String,
}
