/* sys lib */
use nosql_orm::Validate;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct PasswordReset {
  #[validate(email)]
  pub email: String,
  #[validate(not_empty)]
  pub code: String,
  #[validate(not_empty)]
  pub new_password: String,
}
