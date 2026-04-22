/* sys lib */
use lettre::{
  message::header::ContentType,
  transport::smtp::authentication::Credentials,
  {Message, SmtpTransport, Transport},
};

/* models */
use crate::entities::{
  email_config::EmailConfig,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
};

/* helpers */
use crate::helpers::config::ConfigHelper;

pub struct EmailProvider {
  pub config: EmailConfig,
}

impl EmailProvider {
  pub fn new(config: EmailConfig) -> Self {
    Self { config }
  }

  pub fn fromConfig(config: &ConfigHelper) -> Result<Self, ResponseModel> {
    let emailConfig = EmailConfig {
      smtp_username: config.smtpUsername.clone(),
      smtp_password: config.smtpPassword.clone(),
      smtp_server: config.smtpServer.clone(),
      smtp_port: config.smtpPort,
      reset_token_expiry_hours: config.resetTokenExpiryHours,
    };

    Ok(Self::new(emailConfig))
  }

  pub async fn sendPasswordResetCode(
    &self,
    toEmail: &str,
    code: &str,
  ) -> Result<(), ResponseModel> {
    let email = Message::builder()
      .from(
        format!("{} <{}>", "TaskFlow", self.config.smtp_username)
          .parse()
          .map_err(|_| ResponseModel {
            status: ResponseStatus::Error,
            message: "Invalid from email address".to_string(),
            data: DataValue::String("".to_string()),
          })?,
      )
      .to(toEmail.parse().map_err(|_| ResponseModel {
        status: ResponseStatus::Error,
        message: "Invalid to email address".to_string(),
        data: DataValue::String("".to_string()),
      })?)
      .subject("Password Reset Code - TaskFlow")
      .header(ContentType::TEXT_HTML)
      .body(format!(
        r#"
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Password Reset Code</title>
          </head>
          <body>
            <h2>Password Reset Code</h2>
            <p>You have requested to reset your password for your TaskFlow account.</p>
            <p><strong>Your verification code is:</strong></p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #007bff;">
              <span style="font-size: 32px; font-weight: bold; color: #007bff; font-family: monospace; letter-spacing: 8px;">{}</span>
            </div>
            <p>Please enter this code in the application to proceed with your password reset.</p>
            <p>This code will expire in {} hour(s).</p>
            <p>If you did not request this password reset, please ignore this email.</p>
            <p>Best regards,<br>TaskFlow Solutions</p>
          </body>
        </html>
        "#,
        code, self.config.reset_token_expiry_hours
      ))
      .map_err(|_| ResponseModel {
        status: ResponseStatus::Error,
        message: "Failed to build email message".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let creds = Credentials::new(
      self.config.smtp_username.clone(),
      self.config.smtp_password.clone(),
    );

    let mailer = match SmtpTransport::relay(&self.config.smtp_server) {
      Ok(builder) => builder.credentials(creds).build(),
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Failed to create SMTP transport: {}", e),
          data: DataValue::String("".to_string()),
        })
      }
    };

    mailer.send(&email).map_err(|_| ResponseModel {
      status: ResponseStatus::Error,
      message: "Failed to send email".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    Ok(())
  }
}
