/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginForm {
  pub username: String,
  pub password: String,
  pub remember: bool,
}

impl LoginForm {
  pub fn validate(&self) -> Result<(), String> {
    if self.username.is_empty() {
      return Err("username cannot be empty".to_string());
    }
    if self.password.is_empty() {
      return Err("password cannot be empty".to_string());
    }
    Ok(())
  }
}
