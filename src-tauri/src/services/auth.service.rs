/* sys lib */
use std::sync::Arc;

/* providers */
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth::auth_data_sync::AuthDataSyncService;
use super::auth::auth_login::AuthLoginService;
use super::auth::auth_password::AuthPasswordService;
use super::auth::auth_register::AuthRegisterService;
use super::auth::auth_token::AuthTokenService;
use super::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* models */
use crate::entities::{
  login_form_entity::LoginForm, password_reset::PasswordReset, response_entity::ResponseModel,
  signup_form_entity::SignupForm,
};

/* helpers */
use crate::helpers::config::ConfigHelper;

#[derive(Clone)]
pub struct AuthService {
  pub token_service: Arc<AuthTokenService>,
  pub login_service: AuthLoginService,
  pub register_service: AuthRegisterService,
  pub password_service: AuthPasswordService,
  pub auth_data_sync_service: Option<Arc<AuthDataSyncService>>,
}

impl AuthService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    jwt_secret: String,
    _rp_domain: String,
    auth_data_sync_service: Option<Arc<AuthDataSyncService>>,
    profile_sync_service: ProfileSyncUnifiedService,
  ) -> Self {
    let mongo_provider = mongodb_provider.clone();

    let token_service = Arc::new(AuthTokenService::new(
      json_provider.clone(),
      mongo_provider.clone(),
      jwt_secret,
      auth_data_sync_service.clone(),
      profile_sync_service.clone(),
    ));
    let login_service = AuthLoginService::new(
      json_provider.clone(),
      mongo_provider.clone(),
      Arc::clone(&token_service),
      auth_data_sync_service
        .clone()
        .expect("AuthDataSyncService required for login"),
      profile_sync_service.clone(),
    );
    let register_service = AuthRegisterService::new(
      json_provider.clone(),
      mongo_provider.clone(),
      Arc::clone(&token_service),
      profile_sync_service.clone(),
    );
    let password_service = AuthPasswordService::new(json_provider.clone(), mongo_provider.clone());

    Self {
      token_service,
      login_service,
      register_service,
      password_service,
      auth_data_sync_service,
    }
  }

  pub async fn login(&self, login_data: LoginForm) -> Result<ResponseModel, ResponseModel> {
    self.login_service.login(login_data).await
  }

  pub async fn register(&self, signup_data: SignupForm) -> Result<ResponseModel, ResponseModel> {
    self.register_service.register(signup_data).await
  }

  pub async fn check_token(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.token_service.check_token(token).await
  }

  pub async fn request_password_reset(
    &self,
    email: String,
    config: &ConfigHelper,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .password_service
      .request_password_reset(email, config)
      .await
  }

  pub async fn verify_code(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.password_service.verify_code(email, code).await
  }

  pub async fn reset_password(
    &self,
    reset_data: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    self.password_service.reset_password(reset_data).await
  }

  pub async fn change_password(
    &self,
    token: &str,
    jwt_secret: &str,
    new_password: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let user_id = crate::helpers::auth::extract_user_from_token(token, jwt_secret)?;
    self
      .password_service
      .change_password(user_id, new_password)
      .await
  }
}
