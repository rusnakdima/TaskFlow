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
use crate::helpers::response_helper::err_response;

#[derive(Clone)]
pub struct AuthPasswordService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

impl AuthPasswordService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn request_password_reset(
    &self,
    email: String,
    config: &ConfigHelper,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("Password reset unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("email".to_string(), serde_json::json!(email));

    let mut users = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| err_response(&format!("User not found: {}", e)))?;

    let user_val = users.pop().ok_or_else(|| err_response("User not found"))?;

    let mut user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

    let code = format!("{:06}", rand::random::<u32>() % 1000000);
    let expiration = chrono::Utc::now()
      .checked_add_signed(chrono::Duration::minutes(15))
      .expect("valid timestamp")
      .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    user.temporary_code = code.clone();
    user.code_expires_at = expiration;
    user.updated_at = Some(chrono::Utc::now());

    let user_id = user.id.as_ref().cloned().unwrap_or_default();
    let user_json = serde_json::to_value(&user).unwrap();

    let email_service = EmailProvider::from_config(config)?;
    email_service
      .send_password_reset_code(&email, &code)
      .await
      .map_err(|_| err_response("Failed to send reset email"))?;

    mongo
      .update(table_name, &user_id, user_json.clone())
      .await
      .map_err(|e| err_response(&format!("Error updating user: {}", e)))?;

    let _ = self
      .json_provider
      .update(table_name, &user_id, user_json)
      .await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Verification code sent to your email".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  pub async fn verify_code(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("Verification unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("email".to_string(), serde_json::json!(email));

    let mut users = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| err_response(&format!("User not found: {}", e)))?;

    let user_val = users.pop().ok_or_else(|| err_response("User not found"))?;

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

    if user.temporary_code == code && !user.temporary_code.is_empty() {
      let now = chrono::Utc::now();
      if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&user.code_expires_at) {
        if now < expires {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Code verified successfully".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      return Err(err_response("Code expired"));
    }
    Err(err_response("Invalid verification code"))
  }

  pub async fn reset_password(
    &self,
    reset_data: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    let email = reset_data.email;
    let password = reset_data.new_password;

    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("Password reset unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("email".to_string(), serde_json::json!(email));

    let mut users = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| err_response(&format!("User not found: {}", e)))?;

    let user_val = users.pop().ok_or_else(|| err_response("User not found"))?;

    let mut user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

    let hashed_password = hash(password, DEFAULT_COST)
      .map_err(|e| err_response(&format!("Error hashing password: {}", e)))?;

    user.password = hashed_password;
    user.temporary_code = "".to_string();
    user.code_expires_at = "".to_string();
    user.updated_at = Some(chrono::Utc::now());

    let user_id = user.id.as_ref().cloned().unwrap_or_default();
    let user_json = serde_json::to_value(&user).unwrap();

    mongo
      .update(table_name, &user_id, user_json.clone())
      .await
      .map_err(|e| err_response(&format!("Error updating user: {}", e)))?;

    let _ = self
      .json_provider
      .update(table_name, &user_id, user_json)
      .await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Password reset successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }
}
