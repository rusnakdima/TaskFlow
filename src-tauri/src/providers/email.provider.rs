/* Disabled email provider - email functionality removed to reduce build size */

use crate::entities::{
  email_config::EmailConfig,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
};

use crate::helpers::config::ConfigHelper;

#[allow(dead_code)]
pub struct EmailProvider {
  pub config: EmailConfig,
}

impl EmailProvider {
  pub fn new(config: EmailConfig) -> Self {
    Self { config }
  }

  pub fn from_config(_config: &ConfigHelper) -> Result<Self, ResponseModel> {
    Ok(Self::new(EmailConfig {
      smtp_username: String::new(),
      smtp_password: String::new(),
      smtp_server: String::new(),
      smtp_port: 0,
      reset_token_expiry_hours: 1,
    }))
  }

  pub async fn send_password_reset_code(
    &self,
    _to_email: &str,
    _code: &str,
  ) -> Result<(), ResponseModel> {
    Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Email functionality disabled".to_string(),
      data: DataValue::String("".to_string()),
    })
  }
}
