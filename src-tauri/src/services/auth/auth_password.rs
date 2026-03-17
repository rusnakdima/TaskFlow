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
use crate::helpers::response_helper::errResponse;
use crate::helpers::timestamp_helper;

#[derive(Clone)]
pub struct AuthPasswordService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl AuthPasswordService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
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

    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse("Password reset unavailable: MongoDB offline"));
      }
    };

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| errResponse("User not found"))?;

        let mut user: UserModel = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

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
          .map_err(|_| errResponse("Failed to send reset email"))?;

        match mongoProvider
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
          Err(e) => Err(errResponse(&format!("Error updating user: {}", e))),
        }
      }
      Err(e) => Err(errResponse(&format!("User not found: {}", e))),
    }
  }

  pub async fn verifyCode(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "email": email });

    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse("Verification unavailable: MongoDB offline"));
      }
    };

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| errResponse("User not found"))?;

        let user: UserModel = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

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
          Err(errResponse("Code expired"))
        } else {
          Err(errResponse("Invalid verification code"))
        }
      }
      Err(e) => Err(errResponse(&format!("User not found: {}", e))),
    }
  }

  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    let email = resetData.email;
    let password = resetData.newPassword;

    let filter = json!({ "email": email });

    let mongoProvider = match &self.mongodbProvider {
      Some(provider) => provider,
      None => {
        return Err(errResponse("Password reset unavailable: MongoDB offline"));
      }
    };

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| errResponse("User not found"))?;

        let mut user: UserModel = serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

        let hashedPassword = hash(password, DEFAULT_COST)
          .map_err(|e| errResponse(&format!("Error hashing password: {}", e)))?;

        user.password = hashedPassword;
        user.temporaryCode = "".to_string();
        user.codeExpiresAt = "".to_string();
        user.updatedAt = timestamp_helper::getCurrentTimestamp();

        let userId = user.id.clone();
        let userJson = serde_json::to_value(&user).unwrap();

        match mongoProvider
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
          Err(e) => Err(errResponse(&format!("Error updating user: {}", e))),
        }
      }
      Err(e) => Err(errResponse(&format!("User not found: {}", e))),
    }
  }
}
