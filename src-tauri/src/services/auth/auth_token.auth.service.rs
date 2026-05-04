/* sys lib */
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* services */
use crate::services::auth::auth_data_sync::AuthDataSyncService;
use crate::services::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* helpers */
use crate::helpers::response_helper::err_response;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
  pub id: String,
  pub exp: usize,
}

#[derive(Clone)]
pub struct AuthTokenService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub jwt_secret: String,
  pub auth_data_sync_service: Option<Arc<AuthDataSyncService>>,
}

impl AuthTokenService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    jwt_secret: String,
    auth_data_sync_service: Option<Arc<AuthDataSyncService>>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      jwt_secret,
      auth_data_sync_service,
    }
  }

  pub fn generate_token(
    &self,
    user_id: &str,
    _username: &str,
    _role: &str,
  ) -> Result<String, ResponseModel> {
    let expiration = chrono::Utc::now()
      .checked_add_signed(chrono::Duration::hours(24))
      .expect("valid timestamp")
      .timestamp() as usize;

    let claims = Claims {
      id: user_id.to_owned(),
      exp: expiration,
    };

    encode(
      &Header::default(),
      &claims,
      &EncodingKey::from_secret(self.jwt_secret.as_ref()),
    )
    .map_err(|e| err_response(&format!("Token generation failed: {}", e)))
  }

  pub async fn check_token(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    let token_data = decode::<Claims>(
      &token,
      &DecodingKey::from_secret(self.jwt_secret.as_ref()),
      &Validation::default(),
    )
    .map_err(|e| err_response(&format!("Invalid token: {}", e)))?;

    let user_id = token_data.claims.id;
    let table_name = TableModelType::User.table_name();

    // STEP 1: Check local JSON database FIRST (works offline)
    if let Ok(Some(user_val)) = self.json_provider.find_by_id(table_name, &user_id).await {
      let user: UserEntity = serde_json::from_value(user_val.clone())
        .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

      // Try to sync with MongoDB in background (non-blocking)
      if self.mongodb_provider.is_some() {
        let _ = self.sync_user_to_cloud(user_val.clone()).await;
      }

      if let Some(sync_service) = &self.auth_data_sync_service {
        let _ = sync_service.on_user_login(&user_id).await;
      }

      let profile_sync_service =
        ProfileSyncUnifiedService::new(self.json_provider.clone(), self.mongodb_provider.clone());
      let profile = profile_sync_service
        .get_profile(&user_id)
        .await
        .ok()
        .flatten();

      let mut response_data = serde_json::to_value(&user).unwrap();
      if let Some(p) = profile {
        response_data["profile"] = serde_json::to_value(&p).unwrap();
      }

      return Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Token is valid (local)".to_string(),
        data: DataValue::Object(response_data),
      });
    }

    // STEP 2: Local database failed - try MongoDB (if available)
    let mongo_provider = match &self.mongodb_provider {
      Some(provider) => provider,
      None => {
        return Err(err_response(
          "User not found in local database and MongoDB unavailable",
        ));
      }
    };

    match mongo_provider.find_by_id(table_name, &user_id).await {
      Ok(Some(user_val)) => {
        let user: UserEntity = serde_json::from_value(user_val.clone())
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

        // Sync user to local database for future offline use
        let _ = self.json_provider.insert(table_name, user_val).await;

        // Sync profile to local database if it exists in MongoDB
        let profile_filter =
          nosql_orm::query::Filter::Eq("user_id".to_string(), serde_json::json!(user_id));
        if let Ok(profile_val) = mongo_provider
          .find_many("profiles", Some(&profile_filter), None, None, None, true)
          .await
        {
          if let Some(p) = profile_val.first() {
            let _ = self.json_provider.insert("profiles", p.clone()).await;
          }
        }

        if let Some(sync_service) = &self.auth_data_sync_service {
          let _ = sync_service.on_user_login(&user_id).await;
        }

        let profile_sync_service =
          ProfileSyncUnifiedService::new(self.json_provider.clone(), self.mongodb_provider.clone());
        let profile = profile_sync_service
          .get_profile(&user_id)
          .await
          .ok()
          .flatten();

        let mut response_data = serde_json::to_value(&user).unwrap();
        if let Some(p) = profile {
          response_data["profile"] = serde_json::to_value(&p).unwrap();
        }

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Token is valid".to_string(),
          data: DataValue::Object(response_data),
        })
      }
      Ok(None) => Err(err_response("User not found")),
      Err(e) => Err(err_response(&format!("User not found: {}", e))),
    }
  }

  /// Sync user data to MongoDB (non-blocking, best effort)
  async fn sync_user_to_cloud(&self, user_val: serde_json::Value) -> Result<(), ()> {
    let mongo = match &self.mongodb_provider {
      Some(provider) => provider,
      None => return Ok(()),
    };

    let user_id = user_val
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or(())?
      .to_owned();

    let table_name = TableModelType::User.table_name();
    let _ = mongo.update(table_name, &user_id, user_val).await;
    Ok(())
  }
}
