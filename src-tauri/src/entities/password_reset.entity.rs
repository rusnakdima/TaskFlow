/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordReset {
  pub email: String,
  pub code: String,
  pub newPassword: String,
}

impl PasswordReset {
  pub fn validate(&self) -> Result<(), String> {
    if self.email.is_empty() {
      return Err("email cannot be empty".to_string());
    }
    if self.code.is_empty() {
      return Err("code cannot be empty".to_string());
    }
    if self.newPassword.is_empty() {
      return Err("newPassword cannot be empty".to_string());
    }
    Ok(())
  }
}
