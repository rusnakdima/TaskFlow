/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EmailConfig {
  pub smtp_username: String,
  pub smtp_password: String,
  pub smtp_server: String,
  pub smtp_port: u16,
  pub reset_token_expiry_hours: u64,
}
