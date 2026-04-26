/* sys lib */
use bcrypt::{hash, DEFAULT_COST};
use std::sync::Arc;
use uuid::Uuid;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* services */
use super::auth_token::AuthTokenService;

/* models */
use crate::entities::{
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  signup_form_entity::SignupForm,
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::{profile_helper::check_profile_exists, response_helper::err_response};

#[derive(Clone)]
pub struct AuthRegisterService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub token_service: Arc<AuthTokenService>,
}

impl AuthRegisterService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    token_service: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      token_service,
    }
  }

  pub async fn register(&self, signup_data: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let email = signup_data.email;
    let username = signup_data.username;
    let password = signup_data.password;

    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("Registration unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Or(vec![
      Filter::Eq("email".to_string(), serde_json::json!(email)),
      Filter::Eq("username".to_string(), serde_json::json!(username)),
    ]);

    let existing = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| err_response(&format!("Error checking user: {}", e)))?;

    if !existing.is_empty() {
      return Err(err_response("User already exists"));
    }

    let hashed_password = hash(password, DEFAULT_COST)
      .map_err(|e| err_response(&format!("Error hashing password: {}", e)))?;

    let now = chrono::Utc::now();

    let new_user = UserEntity {
      id: Some(Uuid::new_v4().to_string()),
      email,
      username,
      password: hashed_password,
      role: "user".to_string(),
      temporary_code: "".to_string(),
      code_expires_at: "".to_string(),
      profile_id: "".to_string(),
      profile: None,
      created_at: now,
      updated_at: now,
      deleted_at: None,
      totp_enabled: false,
      totp_secret: String::new(),
      passkey_credential_id: String::new(),
      passkey_public_key: String::new(),
      passkey_device: String::new(),
      passkey_enabled: false,
      biometric_enabled: false,
      qr_login_enabled: false,
      recovery_codes: Vec::new(),
    };

    let user_val = serde_json::to_value(&new_user)
      .map_err(|e| err_response(&format!("Failed to serialize user: {}", e)))?;

    mongo
      .insert(table_name, user_val.clone())
      .await
      .map_err(|e| err_response(&format!("Error creating user: {}", e)))?;

    let _ = self.json_provider.insert(table_name, user_val).await;

    let user_id = new_user.get_id();
    let token = self.token_service.generate_token(user_id, "", "")?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "User registered successfully".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "needsProfile": true,
        "profile": null,
        "user_id": user_id
      })),
    })
  }

  pub async fn check_profile_exists(
    &self,
    user_id: &str,
  ) -> Result<Option<ProfileEntity>, ResponseModel> {
    check_profile_exists(
      &self.json_provider,
      self.mongodb_provider.as_deref(),
      user_id,
    )
    .await
  }
}
