/* sys lib */
use bcrypt::verify;
use std::sync::Arc;

/* providers */
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth_data_sync::AuthDataSyncService;
use super::auth_token::AuthTokenService;
use crate::services::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* models */
use crate::entities::{
  login_form_entity::LoginForm,
  response_entity::{ResponseModel, ResponseStatus},
};

/* helpers */
use crate::helpers::{auth::find_user_by_username, response_helper::err_response};

#[derive(Clone)]
pub struct AuthLoginService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub token_service: Arc<AuthTokenService>,
  pub auth_data_sync_service: Arc<AuthDataSyncService>,
  pub profile_sync_service: ProfileSyncUnifiedService,
}

impl AuthLoginService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    token_service: Arc<AuthTokenService>,
    auth_data_sync_service: Arc<AuthDataSyncService>,
    profile_sync_service: ProfileSyncUnifiedService,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      token_service,
      auth_data_sync_service,
      profile_sync_service,
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

    let profile = self
      .profile_sync_service
      .get_profile(&user_id)
      .await
      .ok()
      .flatten();

    let profile_id = profile
      .as_ref()
      .and_then(|p| p.id.as_ref())
      .map(|s| s.as_str());

    let token = self.token_service.generate_token(
      &user_id,
      profile_id,
      "",
      &user.role,
      login_data.remember,
    )?;

    let _ = self.auth_data_sync_service.on_user_login(&user_id).await;

    let profile = self
      .profile_sync_service
      .get_profile(&user_id)
      .await
      .ok()
      .flatten();

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Login successful".to_string(),
      data: serde_json::json!({
        "token": token,
        "profile": profile
      }),
    })
  }
}
