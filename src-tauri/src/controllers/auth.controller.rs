/* helpers */
use crate::helpers::{config::ConfigHelper, mongodb_provider::MongodbProvider};

/* services */
use crate::services::auth_service;

/* models */
use crate::models::{
  login_form_model::LoginForm, password_reset::PasswordReset, response_model::ResponseModel,
  signup_form_model::SignupForm,
};

/* sys */
use std::sync::Arc;

#[allow(non_snake_case)]
pub struct AuthController {
  pub authService: auth_service::AuthService,
  pub config: ConfigHelper,
}

impl AuthController {
  #[allow(non_snake_case)]
  pub fn new(mongodbProvider: Arc<MongodbProvider>, config: ConfigHelper) -> Self {
    return Self {
      authService: auth_service::AuthService::new(mongodbProvider, config.jwtSecret.clone()),
      config,
    };
  }

  #[allow(non_snake_case)]
  pub async fn checkToken(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    return self.authService.checkToken(token).await;
  }

  #[allow(non_snake_case)]
  pub async fn login(&self, loginForm: LoginForm) -> Result<ResponseModel, ResponseModel> {
    return self.authService.login(loginForm).await;
  }

  #[allow(non_snake_case)]
  pub async fn register(&self, signupForm: SignupForm) -> Result<ResponseModel, ResponseModel> {
    return self.authService.register(signupForm).await;
  }

  #[allow(non_snake_case)]
  pub async fn requestPasswordReset(&self, email: String) -> Result<ResponseModel, ResponseModel> {
    return self
      .authService
      .requestPasswordReset(email, &self.config)
      .await;
  }

  #[allow(non_snake_case)]
  pub async fn verifyCode(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.authService.verifyCode(email, code).await;
  }

  #[allow(non_snake_case)]
  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.authService.resetPassword(resetData).await;
  }
}
