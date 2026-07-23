use crate::entities::email_config::EmailConfig;
use tauri_shared::env::EnvConfig;
#[derive(Clone)]
pub struct EmailProvider {
  #[allow(dead_code)]
  config: EmailConfig,
}
impl EmailProvider {
  pub fn from_config(config: &EnvConfig) -> Result<Self, String> {
    let email_config = EmailConfig {
      smtp_username: config.smtp_username.clone(),
      smtp_password: config.smtp_password.clone(),
      smtp_server: config.smtp_server.clone(),
      smtp_port: config.smtp_port,
      reset_token_expiry_hours: config.reset_token_expiry_hours,
    };
    Ok(Self {
      config: email_config,
    })
  }
  pub async fn send_password_reset_code(&self, _email: &str, _code: &str) -> Result<(), String> {
    Ok(())
  }
}
