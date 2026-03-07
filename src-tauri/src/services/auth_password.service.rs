/* sys lib */
use bcrypt::hash;
use chrono::{Duration, Utc};
use mongodb::bson::doc;
use std::sync::Arc;

/* helpers */
use crate::helpers::config::ConfigHelper;

/* providers */
use crate::providers::{email_provider::EmailProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  password_reset::PasswordReset,
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

pub struct AuthPasswordService {
  pub mongodbProvider: Arc<MongodbProvider>,
}

impl AuthPasswordService {
  pub fn new(mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self { mongodbProvider }
  }

  pub async fn requestPasswordReset(
    &self,
    email: String,
    config: &ConfigHelper,
  ) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! { "email": email.clone() };
    match self
      .mongodbProvider
      .get(&nameTable, Some(filter), None, "")
      .await
    {
      Ok(userDoc) => {
        let code = format!("{:06}", rand::random::<u32>() % 1000000);
        let expiresAt =
          (Utc::now() + Duration::minutes(15)).to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

        let emailService = EmailProvider::fromConfig(config)?;
        emailService.sendPasswordResetCode(&email, &code).await?;

        let userId = userDoc
          .get("id")
          .and_then(|v| v.as_str())
          .ok_or_else(|| ResponseModel {
            status: ResponseStatus::Error,
            message: "Error retrieving user ID".to_string(),
            data: DataValue::String("".to_string()),
          })?;

        let updateData = doc! {
          "temporaryCode": code.clone(),
          "codeExpiresAt": expiresAt,
          "updatedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        };

        match self
          .mongodbProvider
          .update(&nameTable, &userId, updateData)
          .await
        {
          Ok(_) => Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Password reset code sent".to_string(),
            data: DataValue::String("".to_string()),
          }),
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error updating user temporary code: {}", e),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("User not found: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn verifyCode(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! {
      "email": email.clone(),
      "temporaryCode": code.clone()
    };
    match self
      .mongodbProvider
      .get(&nameTable, Some(filter), None, "")
      .await
    {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Code verified successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Invalid verification code: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! {
      "email": resetData.email.clone(),
      "temporaryCode": resetData.code.clone(),
      "codeExpiresAt": { "$gt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false) }
    };
    match self
      .mongodbProvider
      .get(&nameTable, Some(filter), None, "")
      .await
    {
      Ok(userDoc) => {
        let userId = userDoc
          .get("id")
          .and_then(|v| v.as_str())
          .ok_or_else(|| ResponseModel {
            status: ResponseStatus::Error,
            message: "Error retrieving user ID".to_string(),
            data: DataValue::String("".to_string()),
          })?;

        let hashedPassword = hash(&resetData.newPassword, 10).map_err(|_| ResponseModel {
          status: ResponseStatus::Error,
          message: "Error hashing new password".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let updateData = doc! {
          "password": hashedPassword,
          "temporaryCode": "",
          "codeExpiresAt": "",
          "updatedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        };

        match self
          .mongodbProvider
          .update(&nameTable, &userId, updateData)
          .await
        {
          Ok(_) => Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Password reset successfully".to_string(),
            data: DataValue::String("".to_string()),
          }),
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error updating password: {}", e),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Invalid verification code: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
