/* sys lib */
use nosql_orm::Validate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, Validate, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PasswordReset {
  #[validate(email)]
  pub email: String,
  #[validate(not_empty)]
  pub code: String,
  #[validate(not_empty)]
  pub new_password: String,
}
