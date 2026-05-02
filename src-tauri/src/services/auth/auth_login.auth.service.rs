/* sys lib */
use bcrypt::verify;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* services */
use super::auth_data_sync::AuthDataSyncService;
use super::auth_token::AuthTokenService;

/* models */
use crate::entities::{
  login_form_entity::LoginForm,
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::{profile_helper::check_profile_exists, response_helper::err_response};

#[derive(Clone)]
pub struct AuthLoginService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub token_service: Arc<AuthTokenService>,
  pub auth_data_sync_service: Arc<AuthDataSyncService>,
}

impl AuthLoginService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    token_service: Arc<AuthTokenService>,
    auth_data_sync_service: Arc<AuthDataSyncService>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      token_service,
      auth_data_sync_service,
    }
  }

  pub async fn login(&self, login_data: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let username = login_data.username;
    let password = login_data.password;
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
        let mongo = match self.mongodb_provider.as_ref() {
          Some(m) => m,
          None => {
            return Err(err_response(
              "User account not found. Please register again.",
            ))
          }
        };
        let mut users = mongo
          .find_many(table_name, Some(&filter), None, None, None, true)
          .await
          .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        match users.pop() {
          Some(u) => {
            if let Some(mongo_user) = self.sync_user_to_json(&u).await.ok().flatten() {
              mongo_user
            } else {
              u
            }
          }
          None => {
            return Err(err_response(
              "User account not found. Please register again.",
            ))
          }
        }
      }
    };

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

    let valid = verify(password, &user.password)
      .map_err(|e| err_response(&format!("Error verifying password: {}", e)))?;

    if !valid {
      return Err(err_response("Invalid password"));
    }

    let token = self.token_service.generate_token(user.id(), "", "")?;

    let user_id = user.id();

    let _ = self.auth_data_sync_service.on_user_login(user_id).await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Login successful".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token
      })),
    })
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

  async fn sync_user_to_json(
    &self,
    mongo_user: &serde_json::Value,
  ) -> Result<Option<serde_json::Value>, ResponseModel> {
    let user_id = mongo_user.get("id").and_then(|v| v.as_str()).unwrap_or("");

    let existing = self
      .json_provider
      .find_by_id(TableModelType::User.table_name(), user_id)
      .await
      .ok()
      .flatten();

    if existing.is_some() {
      return Ok(None);
    }

    let _ = self
      .json_provider
      .insert(TableModelType::User.table_name(), mongo_user.clone())
      .await
      .map_err(|e| err_response(&format!("Failed to sync user to JSON: {}", e)))?;

    Ok(Some(mongo_user.clone()))
  }
}
