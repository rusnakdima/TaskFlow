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
  qr_helper,
  response_helper::{errResponse, successResponse},
};

/* services */
use crate::services::auth::webauthn_state::WebAuthnState;

type PasskeyRegistrationState = (String, PasskeyRegistration);
type PasskeyAuthenticationState = (String, PasskeyAuthentication);

pub struct AuthPasskeyService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub webauthnState: Arc<WebAuthnState>,
  challenge: std::sync::Mutex<Option<PasskeyRegistrationState>>,
  authChallenge: std::sync::Mutex<Option<PasskeyAuthenticationState>>,
}

impl Clone for AuthPasskeyService {
  fn clone(&self) -> Self {
    Self {
      jsonProvider: self.jsonProvider.clone(),
      mongodbProvider: self.mongodbProvider.clone(),
      webauthnState: Arc::clone(&self.webauthnState),
      challenge: std::sync::Mutex::new(None),
      authChallenge: std::sync::Mutex::new(None),
    }
  }
}

impl AuthPasskeyService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
    webauthnState: Arc<WebAuthnState>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      webauthnState,
      challenge: std::sync::Mutex::new(None),
      authChallenge: std::sync::Mutex::new(None),
    }
  }

  pub async fn initRegistration(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.passkey_credential_id.is_empty() && user.passkey_enabled {
      return Err(errResponse(
        "Passkey already registered. Please disable it first.",
      ));
    }

    let user_id =
      Uuid::parse_str(&user.get_id()).map_err(|_| errResponse("Invalid user ID format"))?;

    let (creation_challenge, reg_state) = self
      .webauthnState
      .webauthn
      .start_passkey_registration(user_id, &user.username, &user.email, None)
      .map_err(|e| errResponse(&format!("WebAuthn registration error: {}", e)))?;

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

  pub async fn completeRegistration(
    &self,
    username: &str,
    responseJson: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let storedData = {
      let mut challenge_store = self.challenge.lock().unwrap();
      challenge_store.take()
    };
    let (stored_user, reg_state) =
      storedData.ok_or_else(|| errResponse("No pending registration"))?;

    if stored_user != username {
      return Err(errResponse("Username mismatch"));
    }

    let parsed: RegisterPublicKeyCredential = serde_json::from_str(responseJson)
      .map_err(|e| errResponse(&format!("Invalid credential format: {}", e)))?;

    let passkey = self
      .webauthnState
      .webauthn
      .finish_passkey_registration(&parsed, &reg_state)
      .map_err(|e| errResponse(&format!("Passkey verification failed: {}", e)))?;

    let user = self.findUser(username).await?;

    let mut updatedUser = user.clone();
    updatedUser.passkey_credential_id = passkey.cred_id().to_string();
    updatedUser.passkey_public_key = serde_json::to_string(&passkey)
      .map_err(|e| errResponse(&format!("Failed to serialize credential: {}", e)))?;
    updatedUser.passkey_device = "cross-platform".to_string();
    updatedUser.passkey_enabled = true;
    updatedUser.updated_at = chrono::Utc::now();

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Passkey registered successfully"))
  }

  pub async fn initAuthentication(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    let username_str = match username {
      Some(u) => u.to_string(),
      None => {
        return Err(errResponse(
          "Username is required for passkey authentication",
        ))
      }
    };

    let user = self.findUser(&username_str).await?;

    if user.passkey_credential_id.is_empty() || !user.passkey_enabled {
      return Err(errResponse("Passkey not enabled for this user"));
    }

    let stored_passkey: Passkey = if user.passkey_public_key.is_empty() {
      return Err(errResponse("Passkey credential not properly stored"));
    } else {
      serde_json::from_str(&user.passkey_public_key)
        .map_err(|e| errResponse(&format!("Invalid stored credential: {}", e)))?
    };

    let allowed_credential = stored_passkey;

    let (auth_challenge, auth_state) = self
      .webauthnState
      .webauthn
      .start_passkey_authentication(&[allowed_credential])
      .map_err(|e| errResponse(&format!("Auth start failed: {}", e)))?;

    let mut challenge_store = self.authChallenge.lock().unwrap();
    *challenge_store = Some((username_str.clone(), auth_state));

    let qrPayload = format!(
      "{{\"u\":\"{}\",\"c\":\"{}\",\"t\":{}}}",
      BASE64URL.encode(username_str.as_bytes()),
      auth_challenge.public_key.challenge.clone(),
      chrono::Utc::now().timestamp()
    );

    let encrypted_payload = crate::services::crypto_service::CryptoService::encrypt(&qrPayload)
      .unwrap_or_else(|_| qrPayload.clone());
    let qr_data = format!("taskflow://auth?data={}", encrypted_payload);

    let qr_code = qr_helper::generate_qr_code_data_url(&qr_data);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Authentication initiated".to_string(),
      data: DataValue::Object(json!({
        "options": auth_challenge,
        "qrCode": qr_code,
        "challenge": auth_challenge.public_key.challenge.clone(),
        "username": username_str
      })),
    })
  }

  pub async fn completeAuthentication(
    &self,
    username: &str,
    responseJson: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let storedData = {
      let mut challenge_store = self.authChallenge.lock().unwrap();
      challenge_store.take()
    };
    let (stored_user, auth_state) =
      storedData.ok_or_else(|| errResponse("No pending authentication"))?;

    if stored_user != username {
      return Err(errResponse("Username mismatch"));
    }

    let parsed: PublicKeyCredential = serde_json::from_str(responseJson)
      .map_err(|e| errResponse(&format!("Invalid credential format: {}", e)))?;

    let _auth_result = self
      .webauthnState
      .webauthn
      .finish_passkey_authentication(&parsed, &auth_state)
      .map_err(|e| errResponse(&format!("Authentication verification failed: {}", e)))?;

    let user = self.findUser(username).await?;

    let mut updatedUser = user.clone();
    updatedUser.updated_at = chrono::Utc::now();

    self.saveUser(&updatedUser).await?;

    let profile = self.checkProfileExists(&user.get_id()).await.ok().flatten();
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

  pub async fn disablePasskey(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if user.passkey_credential_id.is_empty() {
      return Err(errResponse("Passkey not enabled"));
    }

    let mut updatedUser = user.clone();
    updatedUser.passkey_credential_id = String::new();
    updatedUser.passkey_public_key = String::new();
    updatedUser.passkey_device = String::new();
    updatedUser.passkey_enabled = false;
    updatedUser.updated_at = chrono::Utc::now();

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Passkey disabled successfully"))
  }

  async fn findUser(&self, username: &str) -> Result<UserEntity, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match self
      .jsonProvider
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
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;
        let mut users = mongo
          .find_many(table_name, Some(&filter), None, None, None, true)
          .await
          .map_err(|e| errResponse(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| errResponse("User not found"))?
      }
    };

    serde_json::from_value::<UserEntity>(user_val)
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
  }

  async fn saveUser(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let user_val = serde_json::to_value(user)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    let user_id = user.get_id();
    let table_name = TableModelType::User.table_name();

    if let Err(e) = self
      .jsonProvider
      .update(table_name, &user_id, user_val.clone())
      .await
    {
      tracing::warn!("Failed to update local user: {}", e);
    }

    if let Some(mongo) = &self.mongodbProvider {
      mongo
        .update(table_name, &user_id, user_val)
        .await
        .map_err(|e| errResponse(&format!("Failed to update MongoDB user: {}", e)))?;
    }

    Ok(())
  }

  pub async fn checkProfileExists(
    &self,
    user_id: &str,
  ) -> Result<Option<ProfileEntity>, ResponseModel> {
    let table_name = "profiles";
    let filter = Filter::Eq("user_id".to_string(), serde_json::json!(user_id));

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
