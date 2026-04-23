/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PasswordReset {
  pub email: String,
  pub code: String,
  pub new_password: String,
}

impl PasswordReset {
  pub fn validate(&self) -> Result<(), String> {
    if self.email.is_empty() {
      return Err("email cannot be empty".to_string());
    }
    if self.code.is_empty() {
      return Err("code cannot be empty".to_string());
    }
    if self.new_password.is_empty() {
      return Err("new_password cannot be empty".to_string());
    }
    Ok(())
  }
}
