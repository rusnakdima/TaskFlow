/* sys lib */
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* models */
use crate::entities::{
  response_entity::{ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* services */
use crate::services::auth::auth_data_sync::AuthDataSyncService;
use crate::services::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* helpers */
use crate::helpers::auth_helper::Claims;
use crate::helpers::response_helper::err_response;

#[derive(Clone)]
pub struct AuthTokenService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub jwt_secret: String,
  pub auth_data_sync_service: Option<Arc<AuthDataSyncService>>,
  pub profile_sync_service: ProfileSyncUnifiedService,
}

impl AuthTokenService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    jwt_secret: String,
    auth_data_sync_service: Option<Arc<AuthDataSyncService>>,
    profile_sync_service: ProfileSyncUnifiedService,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      jwt_secret,
      auth_data_sync_service,
      profile_sync_service,
    }
  }

  pub fn generate_token(
    &self,
    user_id: &str,
    profile_id: Option<&str>,
    _username: &str,
    role: &str,
    remember: bool,
  ) -> Result<String, ResponseModel> {
    let expiration = if remember {
      chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(30))
        .expect("valid timestamp")
        .timestamp() as usize
    } else {
      chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize
    };

    let claims = Claims {
      id: user_id.to_owned(),
      profile_id: profile_id.map(|s| s.to_string()),
      role: if role.is_empty() {
        None
      } else {
        Some(role.to_string())
      },
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

    // If MongoDB is available, check it FIRST to detect deleted users
    if let Some(mongo_provider) = &self.mongodb_provider {
      match mongo_provider.find_by_id(table_name, &user_id).await {
        Ok(Some(user_val)) => {
          let user: UserEntity = serde_json::from_value(user_val.clone())
            .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

          // Sync user to local database for future offline use
          let _ = self
            .json_provider
            .insert(table_name, user_val.clone())
            .await;

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

          // Ensure profile exists in MongoDB, sync from JSON if missing
          let _ = self.ensure_profile_exists(&user_id).await;

          if let Some(sync_service) = &self.auth_data_sync_service {
            let _ = sync_service.on_user_login(&user_id).await;
          }

          let profile = self
            .profile_sync_service
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
            data: response_data,
          })
        }
        Ok(None) => {
          // User deleted from MongoDB - check if exists in JSON for error message
          if self
            .json_provider
            .find_by_id(table_name, &user_id)
            .await
            .is_ok()
          {
            // User exists locally but not in cloud - clean up local data
            let _ = self.cleanup_user_data_from_json(&user_id).await;
            return Err(err_response("User session invalid - please login again"));
          }
          Err(err_response("User not found"))
        }
        Err(e) => {
          // MongoDB error - fall back to JSON if available
          if let Ok(Some(user_val)) = self.json_provider.find_by_id(table_name, &user_id).await {
            let user: UserEntity = serde_json::from_value(user_val.clone())
              .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

            let profile = self
              .profile_sync_service
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
              message: "Token is valid (local fallback)".to_string(),
              data: response_data,
            });
          }
          Err(err_response(&format!(
            "User not found (MongoDB error: {}): Trying JSON also failed",
            e
          )))
        }
      }
    } else {
      // No MongoDB available - check local JSON only (offline mode)
      if let Ok(Some(user_val)) = self.json_provider.find_by_id(table_name, &user_id).await {
        let user: UserEntity = serde_json::from_value(user_val.clone())
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

        if let Some(sync_service) = &self.auth_data_sync_service {
          let _ = sync_service.on_user_login(&user_id).await;
        }

        let profile = self
          .profile_sync_service
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
          data: response_data,
        });
      }
      Err(err_response(
        "User not found in local database and MongoDB unavailable",
      ))
    }
  }

  async fn cleanup_user_data_from_json(&self, user_id: &str) -> Result<(), ()> {
    // Remove user from JSON
    let _ = self.json_provider.delete("users", user_id).await;

    // Remove profile from JSON
    let profile_filter =
      nosql_orm::query::Filter::Eq("user_id".to_string(), serde_json::json!(user_id));
    if let Ok(profiles) = self
      .json_provider
      .find_many("profiles", Some(&profile_filter), None, None, None, false)
      .await
    {
      for profile in profiles {
        if let Some(profile_id) = profile.get("id").and_then(|v| v.as_str()) {
          let _ = self.json_provider.delete("profiles", profile_id).await;
        }
      }
    }

    // Remove user's todos, tasks, subtasks, comments, chats
    for table in &["todos", "tasks", "subtasks", "comments", "chats"] {
      let filter = nosql_orm::query::Filter::Eq("user_id".to_string(), serde_json::json!(user_id));
      if let Ok(items) = self
        .json_provider
        .find_many(table, Some(&filter), None, None, None, false)
        .await
      {
        for item in items {
          if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            let _ = self.json_provider.delete(table, id).await;
          }
        }
      }
    }

    Ok(())
  }

  async fn ensure_profile_exists(&self, user_id: &str) -> Result<(), ResponseModel> {
    // Check if profile exists in MongoDB
    let profile_filter =
      nosql_orm::query::Filter::Eq("user_id".to_string(), serde_json::json!(user_id));

    let profile_exists_mongo = if let Some(mongo) = &self.mongodb_provider {
      mongo
        .find_many("profiles", Some(&profile_filter), None, None, None, false)
        .await
        .map(|mut p| p.pop().is_some())
        .unwrap_or(false)
    } else {
      false
    };

    if profile_exists_mongo {
      return Ok(());
    }

    // Profile not in MongoDB - check JSON
    let profile_exists_json = self
      .json_provider
      .find_many("profiles", Some(&profile_filter), None, None, None, false)
      .await
      .map(|mut p| p.pop().is_some())
      .unwrap_or(false);

    if profile_exists_json {
      // Upload from JSON to MongoDB
      if let Some(mongo) = &self.mongodb_provider {
        if let Ok(profiles) = self
          .json_provider
          .find_many("profiles", Some(&profile_filter), None, None, None, false)
          .await
        {
          for profile in profiles {
            let _ = mongo.insert("profiles", profile).await;
          }
        }
      }
    } else {
      // Profile doesn't exist anywhere - user needs to create one
      return Err(err_response(
        "Profile not found - please create your profile",
      ));
    }

    Ok(())
  }
}
