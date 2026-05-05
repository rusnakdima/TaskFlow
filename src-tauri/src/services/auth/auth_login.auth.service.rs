/* sys lib */
use bcrypt::verify;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth_data_sync::AuthDataSyncService;
use super::auth_token::AuthTokenService;
use crate::services::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* models */
use crate::entities::{
  login_form_entity::LoginForm,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
};

/* helpers */
use crate::helpers::{auth_helper::find_user_by_username, response_helper::err_response};

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

    let user = find_user_by_username(
      &self.json_provider,
      self.mongodb_provider.as_ref(),
      &username,
    )
    .await?;

    let valid = verify(password, &user.password)
      .map_err(|e| err_response(&format!("Error verifying password: {}", e)))?;

    if !valid {
      return Err(err_response("Invalid password"));
    }

    let user_id = user.id().to_string();

    let token = self.token_service.generate_token(&user_id, "", "")?;

    let _ = self.auth_data_sync_service.on_user_login(&user_id).await;

    let profile_sync_service =
      ProfileSyncUnifiedService::new(self.json_provider.clone(), self.mongodb_provider.clone());
    let profile = profile_sync_service
      .get_profile(&user_id)
      .await
      .ok()
      .flatten();

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Login successful".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "profile": profile
      })),
    })
  }

  #[allow(dead_code)]
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
