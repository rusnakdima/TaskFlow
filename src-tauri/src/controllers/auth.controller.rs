/* helpers */
use crate::helpers::{
  config::ConfigHelper, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::auth_service::AuthService;

/* models */
use crate::models::{
  login_form_model::LoginForm, password_reset::PasswordReset, response_model::ResponseModel,
  signup_form_model::SignupForm,
};

/* sys */
use std::sync::Arc;

#[allow(non_snake_case)]
pub struct AuthController {
  pub authService: AuthService,
  pub config: ConfigHelper,
}

impl AuthController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    config: ConfigHelper,
  ) -> Self {
    Self {
      authService: AuthService::new(jsonProvider, mongodbProvider, config.jwtSecret.clone()),
      config,
    }
  }

  #[allow(non_snake_case)]
  pub async fn checkToken(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.authService.checkToken(token).await
  }

  #[allow(non_snake_case)]
  pub async fn login(&self, loginForm: LoginForm) -> Result<ResponseModel, ResponseModel> {
    self.authService.login(loginForm).await
  }

  #[allow(non_snake_case)]
  pub async fn register(&self, signupForm: SignupForm) -> Result<ResponseModel, ResponseModel> {
    self.authService.register(signupForm).await
  }

  #[allow(non_snake_case)]
  pub async fn requestPasswordReset(&self, email: String) -> Result<ResponseModel, ResponseModel> {
    self
      .authService
      .requestPasswordReset(email, &self.config)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn verifyCode(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.authService.verifyCode(email, code).await
  }

  #[allow(non_snake_case)]
  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    self.authService.resetPassword(resetData).await
  }
}
