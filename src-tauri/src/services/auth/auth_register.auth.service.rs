/* sys lib */
use bcrypt::{hash, DEFAULT_COST};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* services */
use super::auth_token::AuthTokenService;
use crate::services::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* models */
use crate::entities::{
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  signup_form_entity::SignupForm,
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::response_helper::{err_response, err_response_formatted, log_response};

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

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Or(vec![
      Filter::Eq("email".to_string(), serde_json::json!(email)),
      Filter::Eq("username".to_string(), serde_json::json!(username)),
    ]);

    let existing = self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| err_response(&format!("Error checking user: {}", e)))?;

    if !existing.is_empty() {
      return Err(err_response("User already exists"));
    }

    let hashed_password = hash(password, DEFAULT_COST)
      .map_err(|e| err_response(&format!("Error hashing password: {}", e)))?;

    let now = Utc::now();
    let user_id = Uuid::new_v4().to_string();
    let profile_id = Uuid::new_v4().to_string();

    let new_profile = ProfileEntity {
      id: Some(profile_id.clone()),
      name: "".to_string(),
      last_name: "".to_string(),
      bio: "".to_string(),
      image_url: "".to_string(),
      user_id: user_id.clone(),
      created_at: Some(now),
      updated_at: Some(now),
    };

    let profile_sync_service =
      ProfileSyncUnifiedService::new(self.json_provider.clone(), self.mongodb_provider.clone());

    println!("[Register] Creating profile for user_id: {}", user_id);
    let create_result = profile_sync_service
      .create_profile_in_json(&new_profile)
      .await;
    match create_result {
      Ok(_) => {
        println!("[Register] Profile created in JSON successfully");
      }
      Err(e) => {
        println!("[Register] Failed to create profile in JSON: {}", e.message);
        return Err(e);
      }
    }

    if self.mongodb_provider.is_some() {
      println!("[Register] Exporting profile to MongoDB");
      if let Err(e) = profile_sync_service
        .export_profile_to_mongo(&new_profile)
        .await
      {
        println!(
          "[Register] Warning: Failed to export profile to MongoDB: {}",
          e.message
        );
      } else {
        println!("[Register] Profile exported to MongoDB");
      }
    }

    let new_user = UserEntity {
      id: Some(user_id.clone()),
      email,
      username,
      password: hashed_password,
      role: "user".to_string(),
      temporary_code: "".to_string(),
      code_expires_at: "".to_string(),
      profile_id: profile_id.clone(),
      profile: None,
      created_at: Some(now),
      updated_at: Some(now),
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

    self
      .json_provider
      .insert(table_name, user_val.clone())
      .await
      .map_err(|e| err_response(&format!("Error creating user in JSON: {}", e)))?;

    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Err(e) = mongo.insert(table_name, user_val.clone()).await {
        log_response(&format!("Warning: Failed to insert user in MongoDB: {}", e));
      }
    }

    let token = self.token_service.generate_token(&user_id, "", "")?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "User registered successfully".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "needsProfile": false,
        "profile": new_profile,
        "user_id": user_id
      })),
    })
  }
}
