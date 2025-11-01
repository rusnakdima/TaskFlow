/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct PasswordReset {
  pub email: String,
  pub code: String,
  pub newPassword: String,
}
