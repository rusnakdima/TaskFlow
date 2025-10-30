/* sys lib */
use lettre::{
  message::header::ContentType,
  transport::smtp::authentication::Credentials,
  {Message, SmtpTransport, Transport},
};

/* models */
use crate::models::{
  email_config::EmailConfig,
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

/* helpers */
use crate::helpers::config::ConfigHelper;

#[allow(non_snake_case)]
pub struct EmailProvider {
  pub config: EmailConfig,
}

impl EmailProvider {
  #[allow(non_snake_case)]
  pub fn new(config: EmailConfig) -> Self {
    Self { config }
  }

  #[allow(non_snake_case)]
  pub fn fromConfig(config: &ConfigHelper) -> Result<Self, ResponseModel> {
    let emailConfig = EmailConfig {
      smtpUsername: config.smtpUsername.clone(),
      smtpPassword: config.smtpPassword.clone(),
      smtpServer: config.smtpServer.clone(),
      smtpPort: config.smtpPort,
      resetTokenExpiryHours: config.resetTokenExpiryHours,
      appScheme: config.appScheme.clone(),
    };

    Ok(Self::new(emailConfig))
  }

  #[allow(non_snake_case)]
  pub async fn sendPasswordResetEmail(
    &self,
    toEmail: &str,
    resetToken: &str,
  ) -> Result<(), ResponseModel> {
    let email = Message::builder()
      .from(
        format!("{} <{}>", "TaskFlow", self.config.smtpUsername)
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
      .subject("Password Reset Request - TaskFlow")
      .header(ContentType::TEXT_HTML)
      .body(format!(
        r#"
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Password Reset</title>
          </head>
          <body>
            <h2>Password Reset Request</h2>
            <p>You have requested to reset your password for your TaskFlow account.</p>
            <p><strong>Click this link to change your password:</strong></p>
            <p style="margin: 20px 0;">
              <a href='{}://change-password?token={}' style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Change My Password
              </a>
            </p>
            <p>If the link above doesn't work, copy and paste this manual link into your browser:</p>
            <p style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">
              {}://change-password?token={}
            </p>
            <p>This token will expire in {} hour(s).</p>
            <p>If you did not request this password reset, please ignore this email.</p>
            <p>Best regards,<br>TaskFlow Solutions</p>
          </body>
        </html>
        "#,
        self.config.appScheme, resetToken, self.config.appScheme, resetToken, self.config.resetTokenExpiryHours
      ))
      .map_err(|_| ResponseModel {
        status: ResponseStatus::Error,
        message: "Failed to build email message".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let creds = Credentials::new(
      self.config.smtpUsername.clone(),
      self.config.smtpPassword.clone(),
    );

    let mailer = SmtpTransport::relay(&self.config.smtpServer)
      .unwrap()
      .credentials(creds)
      .build();

    mailer.send(&email).map_err(|_| ResponseModel {
      status: ResponseStatus::Error,
      message: "Failed to send email".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    Ok(())
  }
}
