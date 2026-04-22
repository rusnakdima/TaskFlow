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
use crate::helpers::response_helper::errResponse;

#[derive(Clone)]
pub struct AuthRegisterService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthRegisterService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
    tokenService: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tokenService,
    }
  }

  pub async fn register(&self, signupData: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let email = signupData.email;
    let username = signupData.username;
    let password = signupData.password;

    let mongo = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("Registration unavailable: MongoDB offline"))?;

    let table_name = TableModelType::User.table_name();
    let filter = Filter::Or(vec![
      Filter::Eq("email".to_string(), serde_json::json!(email)),
      Filter::Eq("username".to_string(), serde_json::json!(username)),
    ]);

    let existing = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| errResponse(&format!("Error checking user: {}", e)))?;

    if !existing.is_empty() {
      return Err(errResponse("User already exists"));
    }

    let hashedPassword = hash(password, DEFAULT_COST)
      .map_err(|e| errResponse(&format!("Error hashing password: {}", e)))?;

    let now = chrono::Utc::now();

    let newUser = UserEntity {
      id: Some(Uuid::new_v4().to_string()),
      email,
      username,
      password: hashedPassword,
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

    let userVal = serde_json::to_value(&newUser)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    mongo
      .insert(table_name, userVal.clone())
      .await
      .map_err(|e| errResponse(&format!("Error creating user: {}", e)))?;

    let _ = self.jsonProvider.insert(table_name, userVal).await;

    let userId = newUser.get_id();
    let token = self
      .tokenService
      .generateToken(&userId, &newUser.username, &newUser.role)?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "User registered successfully".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "needsProfile": true,
        "profile": null,
        "userId": userId
      })),
    })
  }

  pub async fn checkProfileExists(
    &self,
    user_id: &str,
  ) -> Result<Option<ProfileEntity>, ResponseModel> {
    let table_name = "profiles";
    let filter = Filter::Eq("userId".to_string(), serde_json::json!(user_id));

    if let Ok(mut profiles) = self
      .jsonProvider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      if let Some(profile_val) = profiles.pop() {
        let profile: ProfileEntity = serde_json::from_value(profile_val)
          .map_err(|e| errResponse(&format!("Failed to parse profile: {}", e)))?;
        return Ok(Some(profile));
      }
    }

    if let Some(mongo) = &self.mongodbProvider {
      if let Ok(mut profiles) = mongo
        .find_many(table_name, Some(&filter), None, None, None, true)
        .await
      {
        if let Some(profile_val) = profiles.pop() {
          let profile: ProfileEntity = serde_json::from_value(profile_val)
            .map_err(|e| errResponse(&format!("Failed to parse profile: {}", e)))?;
          return Ok(Some(profile));
        }
      }
    }

    Ok(None)
  }
}
