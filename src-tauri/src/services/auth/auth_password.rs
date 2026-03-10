/* sys lib */
use bcrypt::{hash, DEFAULT_COST};
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::{
  email_provider::EmailProvider, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* models */
use crate::models::{
  password_reset::PasswordReset,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  user_model::UserModel,
};

/* helpers */
use crate::helpers::config::ConfigHelper;
use crate::helpers::timestamp_helper;

#[derive(Clone)]
pub struct AuthPasswordService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
}

impl AuthPasswordService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  pub async fn requestPasswordReset(
    &self,
    email: String,
    config: &ConfigHelper,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "email": email });

    match self.mongodbProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "User not found".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let mut user: UserModel =
          serde_json::from_value(userVal.clone()).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Failed to parse user: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        // Generate random 6-digit code
        let code = format!("{:06}", rand::random::<u32>() % 1000000);
        let expiration = chrono::Utc::now()
          .checked_add_signed(chrono::Duration::minutes(15))
          .expect("valid timestamp")
          .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        user.temporaryCode = code.clone();
        user.codeExpiresAt = expiration;
        user.updatedAt = timestamp_helper::getCurrentTimestamp();

        let userId = user.id.clone();
        let userJson = serde_json::to_value(&user).unwrap();

        // Send email with reset code
        let emailService = EmailProvider::fromConfig(config)?;
        emailService
          .sendPasswordResetCode(&email, &code)
          .await
          .map_err(|_| ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to send reset email".to_string(),
            data: DataValue::String("".to_string()),
          })?;

        match self
          .mongodbProvider
          .update("users", &userId, userJson.clone())
          .await
        {
          Ok(_) => {
            let _ = self.jsonProvider.update("users", &userId, userJson).await;

            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Verification code sent to your email".to_string(),
              data: DataValue::String("".to_string()),
            })
          }
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error updating user: {}", e),
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
    let filter = json!({ "email": email });

    match self.mongodbProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "User not found".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let user: UserModel =
          serde_json::from_value(userVal.clone()).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Failed to parse user: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        if user.temporaryCode == code && !user.temporaryCode.is_empty() {
          // Check expiration
          let now = chrono::Utc::now();
          if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&user.codeExpiresAt) {
            if now < expires {
              return Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Code verified successfully".to_string(),
                data: DataValue::String("".to_string()),
              });
            }
          }
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Code expired".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Invalid verification code".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("User not found: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    let email = resetData.email;
    let password = resetData.newPassword;

    let filter = json!({ "email": email });

    match self.mongodbProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "User not found".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let mut user: UserModel =
          serde_json::from_value(userVal.clone()).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Failed to parse user: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        let hashedPassword = hash(password, DEFAULT_COST).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error hashing password: {}", e),
          data: DataValue::String("".to_string()),
        })?;

        user.password = hashedPassword;
        user.temporaryCode = "".to_string();
        user.codeExpiresAt = "".to_string();
        user.updatedAt = timestamp_helper::getCurrentTimestamp();

        let userId = user.id.clone();
        let userJson = serde_json::to_value(&user).unwrap();

        match self
          .mongodbProvider
          .update("users", &userId, userJson.clone())
          .await
        {
          Ok(_) => {
            let _ = self.jsonProvider.update("users", &userId, userJson).await;

            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Password reset successfully".to_string(),
              data: DataValue::String("".to_string()),
            })
          }
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error updating user: {}", e),
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
}
