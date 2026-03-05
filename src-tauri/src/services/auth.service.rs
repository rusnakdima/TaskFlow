/* sys lib */
use std::sync::Arc;

/* helpers */
use crate::helpers::config::ConfigHelper;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  login_form_model::LoginForm, password_reset::PasswordReset, response_model::ResponseModel,
  signup_form_model::SignupForm,
};

/* services */
use super::{
  auth_login::AuthLoginService, auth_password::AuthPasswordService,
  auth_register::AuthRegisterService, auth_token::AuthTokenService,
};

/// AuthService - Unified authentication service
/// Delegates to specialized services: AuthTokenService, AuthLoginService, AuthRegisterService, AuthPasswordService
pub struct AuthService {
  pub tokenService: AuthTokenService,
  pub loginService: AuthLoginService,
  pub registerService: AuthRegisterService,
  pub passwordService: AuthPasswordService,
}

impl AuthService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    jwtSecret: String,
  ) -> Self {
    let tokenService = AuthTokenService::new(Arc::clone(&mongodbProvider), jwtSecret);
    let loginService = AuthLoginService::new(
      jsonProvider,
      Arc::clone(&mongodbProvider),
      tokenService.clone(),
    );
    let registerService = AuthRegisterService::new(Arc::clone(&mongodbProvider));
    let passwordService = AuthPasswordService::new(mongodbProvider);

    Self {
      tokenService,
      loginService,
      registerService,
      passwordService,
    }
  }

  pub async fn checkToken(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.tokenService.checkToken(token).await
  }

  pub async fn login(&self, loginForm: LoginForm) -> Result<ResponseModel, ResponseModel> {
    self.loginService.login(loginForm).await
  }

  pub async fn register(&self, signupForm: SignupForm) -> Result<ResponseModel, ResponseModel> {
    self.registerService.register(signupForm).await
  }

  pub async fn requestPasswordReset(
    &self,
    email: String,
    config: &ConfigHelper,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .passwordService
      .requestPasswordReset(email, config)
      .await
  }

  pub async fn verifyCode(
    &self,
    email: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.passwordService.verifyCode(email, code).await
  }

  pub async fn resetPassword(
    &self,
    resetData: PasswordReset,
  ) -> Result<ResponseModel, ResponseModel> {
    self.passwordService.resetPassword(resetData).await
  }
}
