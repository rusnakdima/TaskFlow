/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SignupForm {
  pub email: String,
  pub username: String,
  pub password: String,
}

impl SignupForm {
  pub fn validate(&self) -> Result<(), String> {
    if self.email.is_empty() {
      return Err("email cannot be empty".to_string());
    }
    if self.username.is_empty() {
      return Err("username cannot be empty".to_string());
    }
    if self.password.is_empty() {
      return Err("password cannot be empty".to_string());
    }
    Ok(())
  }
}
