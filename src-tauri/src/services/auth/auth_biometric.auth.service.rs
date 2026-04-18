/* sys lib */
use serde_json::json;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
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

  async fn findUsers(&self, filter: serde_json::Value) -> Result<UserEntity, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let orm_filter = self.buildFilter(&filter);

    let user_val = match self
      .jsonProvider
      .find_many(table_name, orm_filter.as_ref(), None, None, None, true)
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
          .find_many(table_name, orm_filter.as_ref(), None, None, None, true)
          .await
          .map_err(|e| errResponse(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| errResponse("User not found"))?
      }
    };

    serde_json::from_value::<UserEntity>(user_val)
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))
  }

  fn buildFilter(&self, filter_value: &serde_json::Value) -> Option<Filter> {
    let obj = filter_value.as_object()?;
    let mut filters = Vec::new();

    for (key, value) in obj {
      if key.starts_with('$') {
        continue;
      }
      filters.push(Filter::Eq(key.clone(), value.clone()));
    }

    if filters.is_empty() {
      None
    } else if filters.len() == 1 {
      Some(filters.remove(0))
    } else {
      Some(Filter::And(filters))
    }
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
}
