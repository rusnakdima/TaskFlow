/* sys lib */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* services */
use super::auth::auth_login::AuthLoginService;
use super::auth::auth_password::AuthPasswordService;
use super::auth::auth_register::AuthRegisterService;
use super::auth::auth_token::AuthTokenService;

/* models */
use crate::models::{
  login_form_model::LoginForm, password_reset::PasswordReset, response_model::ResponseModel,
  signup_form_model::SignupForm,
};

/* helpers */
use crate::helpers::config::ConfigHelper;

#[derive(Clone)]
pub struct AuthService {
  pub tokenService: Arc<AuthTokenService>,
  pub loginService: AuthLoginService,
  pub registerService: AuthRegisterService,
  pub passwordService: AuthPasswordService,
}

impl AuthService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    jwtSecret: String,
  ) -> Self {
    // For offline mode, we still need MongoDB for auth services
    // But login will fall back to local JSON if MongoDB is unavailable
    let mongoProvider = mongodbProvider.expect("MongoDB provider required for auth initialization");
    
    let tokenService = Arc::new(AuthTokenService::new(
      jsonProvider.clone(),
      Some(Arc::clone(&mongoProvider)),
      jwtSecret,
    ));
    let loginService = AuthLoginService::new(
      jsonProvider.clone(),
      Some(Arc::clone(&mongoProvider)),
      Arc::clone(&tokenService),
    );
    let registerService =
      AuthRegisterService::new(jsonProvider.clone(), Some(Arc::clone(&mongoProvider)), Arc::clone(&tokenService));
    let passwordService = AuthPasswordService::new(jsonProvider, Some(mongoProvider));

    Self {
      tokenService,
      loginService,
      registerService,
      passwordService,
    }
  }

  pub async fn login(&self, loginData: LoginForm) -> Result<ResponseModel, ResponseModel> {
    self.loginService.login(loginData).await
  }

  pub async fn register(&self, signupData: SignupForm) -> Result<ResponseModel, ResponseModel> {
    self.registerService.register(signupData).await
  }

  pub async fn checkToken(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.tokenService.checkToken(token).await
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
