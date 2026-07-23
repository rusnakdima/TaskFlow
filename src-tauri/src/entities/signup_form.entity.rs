/* sys lib */
use nosql_orm::Validate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Serialize, Deserialize, Validate, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SignupForm {
  #[validate(email)]
  pub email: String,
  #[validate(not_empty)]
  pub username: String,
  #[validate(not_empty)]
  pub password: String,
}
