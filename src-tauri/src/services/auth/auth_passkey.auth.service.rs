/* sys lib */
use data_encoding::BASE64URL;
use serde_json::json;
use std::sync::Arc;
use webauthn_rs::prelude::*;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* models */
use crate::entities::{
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::{
  profile_helper::check_profile_exists,
  qr_helper,
  response_helper::{err_response, success_response},
};

/* services */
use crate::services::auth::webauthn_state::WebAuthnState;

type PasskeyRegistrationState = (String, PasskeyRegistration);
type PasskeyAuthenticationState = (String, PasskeyAuthentication);

pub struct AuthPasskeyService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub webauthn_state: Arc<WebAuthnState>,
  challenge: std::sync::Mutex<Option<PasskeyRegistrationState>>,
  auth_challenge: std::sync::Mutex<Option<PasskeyAuthenticationState>>,
}

impl Clone for AuthPasskeyService {
  fn clone(&self) -> Self {
    Self {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
      webauthn_state: Arc::clone(&self.webauthn_state),
      challenge: std::sync::Mutex::new(None),
      auth_challenge: std::sync::Mutex::new(None),
    }
  }
}

impl AuthPasskeyService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    webauthn_state: Arc<WebAuthnState>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      webauthn_state,
      challenge: std::sync::Mutex::new(None),
      auth_challenge: std::sync::Mutex::new(None),
    }
  }

  pub async fn init_registration(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if !user.passkey_credential_id.is_empty() && user.passkey_enabled {
      return Err(err_response(
        "Passkey already registered. Please disable it first.",
      ));
    }

    let user_id =
      Uuid::parse_str(user.get_id()).map_err(|_| err_response("Invalid user ID format"))?;

    let (creation_challenge, reg_state) = self
      .webauthn_state
      .webauthn
      .start_passkey_registration(user_id, &user.username, &user.email, None)
      .map_err(|e| err_response(&format!("WebAuthn registration error: {}", e)))?;

    let mut challenge_store = self.challenge.lock().unwrap();
    *challenge_store = Some((username.to_string(), reg_state));

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Registration initiated".to_string(),
      data: DataValue::Object(json!({
        "options": creation_challenge,
        "challenge": creation_challenge.public_key.challenge.clone()
      })),
    })
  }

  pub async fn complete_registration(
    &self,
    username: &str,
    response_json: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let stored_data = {
      let mut challenge_store = self.challenge.lock().unwrap();
      challenge_store.take()
    };
    let (stored_user, reg_state) =
      stored_data.ok_or_else(|| err_response("No pending registration"))?;

    if stored_user != username {
      return Err(err_response("Username mismatch"));
    }

    let parsed: RegisterPublicKeyCredential = serde_json::from_str(response_json)
      .map_err(|e| err_response(&format!("Invalid credential format: {}", e)))?;

    let passkey = self
      .webauthn_state
      .webauthn
      .finish_passkey_registration(&parsed, &reg_state)
      .map_err(|e| err_response(&format!("Passkey verification failed: {}", e)))?;

    let user = self.find_user(username).await?;

    let mut updated_user = user.clone();
    updated_user.passkey_credential_id = passkey.cred_id().to_string();
    updated_user.passkey_public_key = serde_json::to_string(&passkey)
      .map_err(|e| err_response(&format!("Failed to serialize credential: {}", e)))?;
    updated_user.passkey_device = "cross-platform".to_string();
    updated_user.passkey_enabled = true;
    updated_user.updated_at = Some(chrono::Utc::now());

    self.save_user(&updated_user).await?;

    Ok(success_response("Passkey registered successfully"))
  }

  pub async fn init_authentication(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    let username_str = match username {
      Some(u) => u.to_string(),
      None => {
        return Err(err_response(
          "Username is required for passkey authentication",
        ))
      }
    };

    let user = self.find_user(&username_str).await?;

    if user.passkey_credential_id.is_empty() || !user.passkey_enabled {
      return Err(err_response("Passkey not enabled for this user"));
    }

    let stored_passkey: Passkey = if user.passkey_public_key.is_empty() {
      return Err(err_response("Passkey credential not properly stored"));
    } else {
      serde_json::from_str(&user.passkey_public_key)
        .map_err(|e| err_response(&format!("Invalid stored credential: {}", e)))?
    };

    let allowed_credential = stored_passkey;

    let (auth_challenge, auth_state) = self
      .webauthn_state
      .webauthn
      .start_passkey_authentication(&[allowed_credential])
      .map_err(|e| err_response(&format!("Auth start failed: {}", e)))?;

    let mut challenge_store = self.auth_challenge.lock().unwrap();
    *challenge_store = Some((username_str.clone(), auth_state));

    let qr_payload = format!(
      "{{\"u\":\"{}\",\"c\":\"{}\",\"t\":{}}}",
      BASE64URL.encode(username_str.as_bytes()),
      auth_challenge.public_key.challenge.clone(),
      chrono::Utc::now().timestamp()
    );

    let encrypted_payload = crate::services::crypto_service::CryptoService::encrypt(&qr_payload)
      .unwrap_or_else(|_| qr_payload.clone());
    let qr_data = format!("taskflow://auth?data={}", encrypted_payload);

    let qr_code = qr_helper::generate_qr_code_data_url(&qr_data);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Authentication initiated".to_string(),
      data: DataValue::Object(json!({
        "options": auth_challenge,
        "qr_code": qr_code,
        "challenge": auth_challenge.public_key.challenge.clone(),
        "username": username_str
      })),
    })
  }

  pub async fn complete_authentication(
    &self,
    username: &str,
    response_json: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let stored_data = {
      let mut challenge_store = self.auth_challenge.lock().unwrap();
      challenge_store.take()
    };
    let (stored_user, auth_state) =
      stored_data.ok_or_else(|| err_response("No pending authentication"))?;

    if stored_user != username {
      return Err(err_response("Username mismatch"));
    }

    let parsed: PublicKeyCredential = serde_json::from_str(response_json)
      .map_err(|e| err_response(&format!("Invalid credential format: {}", e)))?;

    let _auth_result = self
      .webauthn_state
      .webauthn
      .finish_passkey_authentication(&parsed, &auth_state)
      .map_err(|e| err_response(&format!("Authentication verification failed: {}", e)))?;

    let user = self.find_user(username).await?;

    let mut updated_user = user.clone();
    updated_user.updated_at = Some(chrono::Utc::now());

    self.save_user(&updated_user).await?;

    let profile = self
      .check_profile_exists(user.get_id())
      .await
      .ok()
      .flatten();
    let needs_profile = profile.is_none();

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Authentication successful".to_string(),
      data: DataValue::Object(json!({
        "verified": true,
        "username": username.to_string(),
        "method": "passkey",
        "needsProfile": needs_profile,
        "profile": profile
      })),
    })
  }

  pub async fn disable_passkey(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if user.passkey_credential_id.is_empty() {
      return Err(err_response("Passkey not enabled"));
    }

    let mut updated_user = user.clone();
    updated_user.passkey_credential_id = String::new();
    updated_user.passkey_public_key = String::new();
    updated_user.passkey_device = String::new();
    updated_user.passkey_enabled = false;
    updated_user.updated_at = Some(chrono::Utc::now());

    self.save_user(&updated_user).await?;

    Ok(success_response("Passkey disabled successfully"))
  }

  async fn find_user(&self, username: &str) -> Result<UserEntity, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut users) => {
        if users.is_empty() {
          None
        } else {
          Some(users.remove(0))
        }
      }
      Err(_) => None,
    };

    let user_val = match user_val {
      Some(v) => v,
      None => {
        let mongo = self
          .mongodb_provider
          .as_ref()
          .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
        let mut users = mongo
          .find_many(table_name, Some(&filter), None, None, None, true)
          .await
          .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| err_response("User not found"))?
      }
    };

    serde_json::from_value::<UserEntity>(user_val)
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))
  }

  async fn save_user(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let user_val = serde_json::to_value(user)
      .map_err(|e| err_response(&format!("Failed to serialize user: {}", e)))?;

    let user_id = user.get_id();
    let table_name = TableModelType::User.table_name();

    if let Err(e) = self
      .json_provider
      .update(table_name, user_id, user_val.clone())
      .await
    {
      tracing::warn!("Failed to update local user: {}", e);
    }

    if let Some(mongo) = &self.mongodb_provider {
      mongo
        .update(table_name, user_id, user_val)
        .await
        .map_err(|e| err_response(&format!("Failed to update MongoDB user: {}", e)))?;
    }

    Ok(())
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
