/* sys lib */
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  user_model::UserModel,
};

/* helpers */
use crate::helpers::{
  crypto_helper,
  response_helper::{errResponse, successResponse},
};

pub struct AuthBiometricService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  challenge: std::sync::Mutex<Option<(String, String)>>,
}

impl Clone for AuthBiometricService {
  fn clone(&self) -> Self {
    Self {
      jsonProvider: self.jsonProvider.clone(),
      mongodbProvider: self.mongodbProvider.clone(),
      challenge: std::sync::Mutex::new(None),
    }
  }
}

impl AuthBiometricService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      challenge: std::sync::Mutex::new(None),
    }
  }

  pub fn getPlatformName() -> &'static str {
    #[cfg(target_os = "macos")]
    return "Touch ID";
    #[cfg(target_os = "windows")]
    return "Windows Hello";
    #[cfg(target_os = "linux")]
    return "Biometric";
    #[cfg(target_os = "android")]
    return "Fingerprint";
    #[cfg(target_os = "ios")]
    return "Face ID";
    #[cfg(not(any(
      target_os = "macos",
      target_os = "windows",
      target_os = "linux",
      target_os = "android",
      target_os = "ios"
    )))]
    return "Biometric";
  }

  pub async fn initBiometricAuth(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = if let Some(un) = username {
      serde_json::json!({ "username": un, "biometricEnabled": true })
    } else {
      serde_json::json!({ "biometricEnabled": true })
    };

    let user = self.findUsers(filter).await?;

    if !user.biometricEnabled {
      return Err(errResponse("Biometric not enabled for this user"));
    }

    let challenge = crypto_helper::generate_challenge();
    let authOptions = json!({
      "challenge": challenge,
      "timeout": 60000,
      "rpId": "taskflow.local",
      "allowCredentials": [{
        "type": "public-key",
        "id": user.passkeyCredentialId,
        "transports": ["internal"]
      }],
      "authenticatorSelection": {
        "authenticatorAttachment": "platform",
        "requireResidentKey": false,
        "userVerification": "required"
      },
      "userVerification": "required"
    });

    let mut challenge_store = self.challenge.lock().unwrap();
    let usernameStr = username.unwrap_or(user.username.as_str());
    *challenge_store = Some((usernameStr.to_string(), challenge.clone()));

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Biometric authentication ready".to_string(),
      data: DataValue::Object(json!({
        "options": authOptions,
        "challenge": challenge,
        "platform": Self::getPlatformName()
      })),
    })
  }

  pub async fn enableBiometric(
    &self,
    username: &str,
    credentialId: &str,
    publicKey: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if user.biometricEnabled {
      return Err(errResponse("Biometric already enabled"));
    }

    let mut updatedUser = user.clone();
    updatedUser.passkeyCredentialId = credentialId.to_string();
    updatedUser.passkeyPublicKey = publicKey.to_string();
    updatedUser.passkeyDevice = "platform".to_string();
    updatedUser.biometricEnabled = true;
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Biometric enabled successfully"))
  }

  pub async fn completeBiometricAuth(
    &self,
    username: &str,
    _signature: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let storedData = {
      let mut challenge_store = self.challenge.lock().unwrap();
      challenge_store.take()
    };
    let storedUser = storedData
      .ok_or_else(|| errResponse("No pending biometric authentication"))?
      .0;

    if storedUser != username {
      return Err(errResponse("Username mismatch"));
    }

    let user = self.findUser(username).await?;

    if !user.biometricEnabled {
      return Err(errResponse("Biometric not enabled for this user"));
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Biometric authentication successful".to_string(),
      data: DataValue::String("biometric_verified".to_string()),
    })
  }

  pub async fn disableBiometric(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.findUser(username).await?;

    if !user.biometricEnabled {
      return Err(errResponse("Biometric not enabled"));
    }

    let mut updatedUser = user.clone();
    updatedUser.biometricEnabled = false;
    updatedUser.updatedAt = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Biometric disabled successfully"))
  }

  async fn findUser(&self, username: &str) -> Result<UserModel, ResponseModel> {
    let filter = json!({ "username": username });

    match self
      .jsonProvider
      .getAll("users", Some(filter.clone()))
      .await
    {
      Ok(users) => {
        if let Some(userVal) = users.first() {
          return serde_json::from_value(userVal.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)));
        }
      }
      Err(_) => {}
    }

    let mongoProvider = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| errResponse("User not found"))?;
        serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
      }
      Err(e) => Err(errResponse(&format!("Database error: {}", e))),
    }
  }

  async fn findUsers(&self, filter: serde_json::Value) -> Result<UserModel, ResponseModel> {
    match self
      .jsonProvider
      .getAll("users", Some(filter.clone()))
      .await
    {
      Ok(users) => {
        if let Some(userVal) = users.first() {
          return serde_json::from_value(userVal.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)));
        }
      }
      Err(_) => {}
    }

    let mongoProvider = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match mongoProvider.getAll("users", Some(filter)).await {
      Ok(users) => {
        let userVal = users.first().ok_or_else(|| errResponse("User not found"))?;
        serde_json::from_value(userVal.clone())
          .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
      }
      Err(e) => Err(errResponse(&format!("Database error: {}", e))),
    }
  }

  async fn saveUser(&self, user: &UserModel) -> Result<(), ResponseModel> {
    let userVal = serde_json::to_value(user)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    let userId = &user.id;

    if let Err(e) = self
      .jsonProvider
      .update("users", userId, userVal.clone())
      .await
    {
      tracing::warn!("Failed to update local user: {}", e);
    }

    if let Some(mongoProvider) = &self.mongodbProvider {
      mongoProvider
        .update("users", userId, userVal)
        .await
        .map_err(|e| errResponse(&format!("Failed to update MongoDB user: {}", e)))?;
    }

    Ok(())
  }
}
