/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginForm {
  pub username: String,
  pub password: String,
  pub remember: bool,
}