/* sys lib */
use bcrypt::{hash, DEFAULT_COST};
use std::sync::Arc;

/* providers */
use crate::providers::{
  email_provider::EmailProvider, json_provider::JsonProvider, mongodb_provider::MongoProvider,
};
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;

/* models */
use crate::entities::{
  password_reset::PasswordReset,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::config::ConfigHelper;
use crate::helpers::response_helper::errResponse;

#[derive(Clone)]
pub struct AuthPasswordService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
}

impl AuthPasswordService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongoProvider>>) -> Self {
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
    let mongo = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("Password reset unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("email".to_string(), serde_json::json!(email));

    let mut users = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| errResponse(&format!("User not found: {}", e)))?;

    let user_val = users.pop().ok_or_else(|| errResponse("User not found"))?;

    let mut user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

    let code = format!("{:06}", rand::random::<u32>() % 1000000);
    let expiration = chrono::Utc::now()
      .checked_add_signed(chrono::Duration::minutes(15))
      .expect("valid timestamp")
      .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    user.temporaryCode = code.clone();
    user.codeExpiresAt = expiration;
    user.updated_at = chrono::Utc::now();

    let user_id = user.id.as_ref().cloned().unwrap_or_default();
    let user_json = serde_json::to_value(&user).unwrap();

    let email_service = EmailProvider::fromConfig(config)?;
    email_service
      .sendPasswordResetCode(&email, &code)
      .await
      .map_err(|_| errResponse("Failed to send reset email"))?;

    mongo
      .update(table_name, &user_id, user_json.clone())
      .await
      .map_err(|e| errResponse(&format!("Error updating user: {}", e)))?;

    let _ = self
      .jsonProvider
      .update(table_name, &user_id, user_json)
      .await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Verification code sent to your email".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  pub async fn verifyCode(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("Verification unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("email".to_string(), serde_json::json!(email));

    let mut users = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| errResponse(&format!("User not found: {}", e)))?;

    let user_val = users.pop().ok_or_else(|| errResponse("User not found"))?;

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

    if user.temporaryCode == code && !user.temporaryCode.is_empty() {
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
      return Err(errResponse("Code expired"));
    }
    Err(errResponse("Invalid verification code"))
  }

  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    let email = resetData.email;
    let password = resetData.newPassword;

    let mongo = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("Password reset unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("email".to_string(), serde_json::json!(email));

    let mut users = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| errResponse(&format!("User not found: {}", e)))?;

    let user_val = users.pop().ok_or_else(|| errResponse("User not found"))?;

    let mut user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

    let hashedPassword = hash(password, DEFAULT_COST)
      .map_err(|e| errResponse(&format!("Error hashing password: {}", e)))?;

    user.password = hashedPassword;
    user.temporaryCode = "".to_string();
    user.codeExpiresAt = "".to_string();
    user.updated_at = chrono::Utc::now();

    let user_id = user.id.as_ref().cloned().unwrap_or_default();
    let user_json = serde_json::to_value(&user).unwrap();

    mongo
      .update(table_name, &user_id, user_json.clone())
      .await
      .map_err(|e| errResponse(&format!("Error updating user: {}", e)))?;

    let _ = self
      .jsonProvider
      .update(table_name, &user_id, user_json)
      .await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Password reset successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }
}
