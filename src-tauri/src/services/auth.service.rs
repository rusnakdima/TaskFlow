/* sys lib */
use std::sync::Arc;

/* providers */
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth::auth_login::AuthLoginService;
use super::auth::auth_password::AuthPasswordService;
use super::auth::auth_register::AuthRegisterService;
use super::auth::auth_token::AuthTokenService;
use super::auth::webauthn_state::WebAuthnState;

/* models */
use crate::entities::{
  login_form_entity::LoginForm, password_reset::PasswordReset, response_entity::ResponseModel,
  signup_form_entity::SignupForm,
};

/* helpers */
use crate::helpers::config::ConfigHelper;
use webauthn_rs::prelude::Url;

#[derive(Clone)]
pub struct AuthService {
  pub token_service: Arc<AuthTokenService>,
  pub login_service: AuthLoginService,
  pub register_service: AuthRegisterService,
  pub password_service: AuthPasswordService,
  pub webauthn_state: Arc<WebAuthnState>,
}

impl AuthService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    jwt_secret: String,
    rp_domain: String,
  ) -> Self {
    let mongo_provider = mongodb_provider.clone();

    let token_service = Arc::new(AuthTokenService::new(
      json_provider.clone(),
      mongo_provider.clone(),
      jwt_secret,
    ));
    let login_service = AuthLoginService::new(
      json_provider.clone(),
      mongo_provider.clone(),
      Arc::clone(&token_service),
    );
    let register_service = AuthRegisterService::new(
      json_provider.clone(),
      mongo_provider.clone(),
      Arc::clone(&token_service),
    );
    let password_service = AuthPasswordService::new(json_provider.clone(), mongo_provider.clone());

    let rp_origin = Url::parse(&format!("https://{}", rp_domain)).unwrap_or_else(|_| {
      eprintln!(
        "WARNING: Invalid RP origin URL '{}', using default",
        rp_domain
      );
      Url::parse("https://taskflow.tcs.com").expect("Hardcoded fallback URL is valid")
    });
    let webauthn_state = Arc::new(WebAuthnState::new(&rp_domain, &rp_origin));

    Self {
      token_service,
      login_service,
      register_service,
      password_service,
      webauthn_state,
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
}
