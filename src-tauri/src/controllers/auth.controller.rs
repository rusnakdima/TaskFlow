/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::auth_service;

/* models */
use crate::models::{
  login_form_model::LoginForm, response::ResponseModel, signup_form_model::SignupForm,
};

#[allow(non_snake_case)]
pub struct AuthController {
  pub authService: auth_service::AuthService,
}

impl AuthController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    return Self {
      authService: auth_service::AuthService::new(jsonProvider),
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
}
