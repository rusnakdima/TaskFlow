/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailConfig {
  pub smtpUsername: String,
  pub smtpPassword: String,
  pub smtpServer: String,
  pub smtpPort: u16,
  pub resetTokenExpiryHours: u64,
}
