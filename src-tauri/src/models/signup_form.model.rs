/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SignupForm {
  pub email: String,
  pub username: String,
  pub password: String,
}
