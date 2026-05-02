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
  response_helper::{err_response, success_response},
};

pub struct AuthBiometricService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  challenge: std::sync::Mutex<Option<(String, String)>>,
}

impl Clone for AuthBiometricService {
  fn clone(&self) -> Self {
    Self {
      json_provider: self.json_provider.clone(),
      mongodb_provider: self.mongodb_provider.clone(),
      challenge: std::sync::Mutex::new(None),
    }
  }
}

impl AuthBiometricService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      challenge: std::sync::Mutex::new(None),
    }
  }

  pub fn get_platform_name() -> &'static str {
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

  pub async fn init_biometric_auth(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = if let Some(un) = username {
      serde_json::json!({ "username": un, "biometric_enabled": true })
    } else {
      serde_json::json!({ "biometric_enabled": true })
    };

    let user = self.find_users(filter).await?;

    if !user.biometric_enabled {
      return Err(err_response("Biometric not enabled for this user"));
    }

    let challenge = crypto_helper::generate_challenge();
    let auth_options = json!({
      "challenge": challenge,
      "timeout": 60000,
      "rpId": "taskflow.local",
      "allowCredentials": [{
        "type": "public-key",
        "id": user.passkey_credential_id,
        "transports": ["internal"]
      }],
      "authenticatorSelection": {
        "authenticatorAttachment": "platform",
        "requireResidentKey": false,
        "userVerification": "required"
      },
      "userVerification": "required"
    });

    let mut challenge_store = self.challenge.lock().unwrap_or_else(|e| {
      eprintln!("WARNING: challenge lock poisoned, recovering: {}", e);
      e.into_inner()
    });
    let username_str = username.unwrap_or(user.username.as_str());
    *challenge_store = Some((username_str.to_string(), challenge.clone()));

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Biometric authentication ready".to_string(),
      data: DataValue::Object(json!({
        "options": auth_options,
        "challenge": challenge,
        "platform": Self::get_platform_name()
      })),
    })
  }

  pub async fn enable_biometric(
    &self,
    username: &str,
    credential_id: &str,
    public_key: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if user.biometric_enabled {
      return Err(err_response("Biometric already enabled"));
    }

    let mut updated_user = user.clone();
    updated_user.passkey_credential_id = credential_id.to_string();
    updated_user.passkey_public_key = public_key.to_string();
    updated_user.passkey_device = "platform".to_string();
    updated_user.biometric_enabled = true;
    updated_user.updated_at = Some(chrono::Utc::now());

    self.save_user(&updated_user).await?;

    Ok(success_response("Biometric enabled successfully"))
  }

  pub async fn complete_biometric_auth(
    &self,
    username: &str,
    _signature: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let stored_data = {
      let mut challenge_store = self.challenge.lock().unwrap_or_else(|e| {
        eprintln!("WARNING: challenge lock poisoned, recovering: {}", e);
        e.into_inner()
      });
      challenge_store.take()
    };
    let stored_user = stored_data
      .ok_or_else(|| err_response("No pending biometric authentication"))?
      .0;

    if stored_user != username {
      return Err(err_response("Username mismatch"));
    }

    let user = self.find_user(username).await?;

    if !user.biometric_enabled {
      return Err(err_response("Biometric not enabled for this user"));
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Biometric authentication successful".to_string(),
      data: DataValue::String("biometric_verified".to_string()),
    })
  }

  pub async fn disable_biometric(&self, username: &str) -> Result<ResponseModel, ResponseModel> {
    let user = self.find_user(username).await?;

    if !user.biometric_enabled {
      return Err(err_response("Biometric not enabled"));
    }

    let mut updated_user = user.clone();
    updated_user.biometric_enabled = false;
    updated_user.updated_at = Some(chrono::Utc::now());

    self.save_user(&updated_user).await?;

    Ok(success_response("Biometric disabled successfully"))
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

  async fn find_users(&self, filter: serde_json::Value) -> Result<UserEntity, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let orm_filter = self.build_filter(&filter);

    let user_val = match self
      .json_provider
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
          .mongodb_provider
          .as_ref()
          .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
        let mut users = mongo
          .find_many(table_name, orm_filter.as_ref(), None, None, None, true)
          .await
          .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| err_response("User not found"))?
      }
    };

    serde_json::from_value::<UserEntity>(user_val)
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))
  }

  fn build_filter(&self, filter_value: &serde_json::Value) -> Option<Filter> {
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

  async fn save_user(&self, user: &UserEntity) -> Result<(), ResponseModel> {
    let user_val = serde_json::to_value(user)
      .map_err(|e| err_response(&format!("Failed to serialize user: {}", e)))?;

    let user_id = user.id();
    let table_name = TableModelType::User.table_name();

    if let Err(_e) = self
      .json_provider
      .update(table_name, user_id, user_val.clone())
      .await
    {}

    if let Some(mongo) = &self.mongodb_provider {
      mongo
        .update(table_name, user_id, user_val)
        .await
        .map_err(|e| err_response(&format!("Failed to update MongoDB user: {}", e)))?;
    }

    Ok(())
  }
}
