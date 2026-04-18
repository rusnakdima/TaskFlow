/* sys lib */
use serde_json::json;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::{
  crypto_helper,
  response_helper::{errResponse, successResponse},
};

pub struct AuthBiometricService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
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
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongoProvider>>) -> Self {
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
    updatedUser.updated_at = chrono::Utc::now();

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
    updatedUser.updated_at = chrono::Utc::now();

    self.saveUser(&updatedUser).await?;

    Ok(successResponse("Biometric disabled successfully"))
  }

  async fn findUser(&self, username: &str) -> Result<UserEntity, ResponseModel> {
    match self.jsonProvider.find_all("users").await {
      Ok(users) => {
        for userVal in users {
          if let Ok(user) = serde_json::from_value::<UserEntity>(userVal.clone()) {
            if user.username == username {
              return Ok(user);
            }
          }
        }
      }
      Err(_) => {}
    }

    let mongoProvider = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match mongoProvider.find_all("users").await {
      Ok(users) => {
        for userVal in users {
          if let Ok(user) = serde_json::from_value::<UserEntity>(userVal.clone()) {
            if user.username == username {
              return Ok(user);
            }
          }
        }
        Err(errResponse("User not found"))
      }
      Err(e) => Err(errResponse(&format!("Database error: {}", e))),
    }
  }

  async fn findUsers(&self, filter: serde_json::Value) -> Result<UserEntity, ResponseModel> {
    match self.jsonProvider.find_all("users").await {
      Ok(users) => {
        for userVal in users {
          if let Ok(user) = serde_json::from_value::<UserEntity>(userVal.clone()) {
            if user.biometricEnabled
              == filter
                .get("biometricEnabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(user.biometricEnabled)
            {
              if let Some(username_filter) = filter.get("username").and_then(|v| v.as_str()) {
                if user.username == username_filter {
                  return Ok(user);
                }
              } else {
                return Ok(user);
              }
            }
          }
        }
      }
      Err(_) => {}
    }

    let mongoProvider = self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| errResponse("User not found and MongoDB unavailable"))?;

    match mongoProvider.find_all("users").await {
      Ok(users) => {
        for userVal in users {
          if let Ok(user) = serde_json::from_value::<UserEntity>(userVal.clone()) {
            if user.biometricEnabled
              == filter
                .get("biometricEnabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(user.biometricEnabled)
            {
              if let Some(username_filter) = filter.get("username").and_then(|v| v.as_str()) {
                if user.username == username_filter {
                  return Ok(user);
                }
              } else {
                return Ok(user);
              }
            }
          }
        }
        Err(errResponse("User not found"))
      }
      Err(e) => Err(errResponse(&format!("Database error: {}", e))),
    }
  }

  async fn saveUser(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let userVal = serde_json::to_value(user)
      .map_err(|e| errResponse(&format!("Failed to serialize user: {}", e)))?;

    let userId = user.get_id();

    if let Err(e) = self
      .jsonProvider
      .update("users", &userId, userVal.clone())
      .await
    {
      tracing::warn!("Failed to update local user: {}", e);
    }

    if let Some(mongoProvider) = &self.mongodbProvider {
      mongoProvider
        .update("users", &userId, userVal)
        .await
        .map_err(|e| errResponse(&format!("Failed to update MongoDB user: {}", e)))?;
    }

    Ok(())
  }
}
