/* sys lib */
use std::sync::Arc;

/* providers */
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* services */
use super::auth::auth_biometric::AuthBiometricService;
use super::auth::auth_login::AuthLoginService;
use super::auth::auth_passkey::AuthPasskeyService;
use super::auth::auth_password::AuthPasswordService;
use super::auth::auth_qr::QrAuthService;
use super::auth::auth_register::AuthRegisterService;
use super::auth::auth_token::AuthTokenService;
use super::auth::auth_totp::AuthTotpService;
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
  pub totp_service: AuthTotpService,
  pub passkey_service: AuthPasskeyService,
  pub biometric_service: AuthBiometricService,
  pub qr_auth_service: QrAuthService,
  pub webauthn_state: Arc<WebAuthnState>,
}

impl AuthService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    jwt_secret: String,
    rp_domain: String,
  ) -> Self {
    let mongo_provider =
      mongodb_provider.expect("MongoDB provider required for auth initialization");

    let token_service = Arc::new(AuthTokenService::new(
      json_provider.clone(),
      Some(Arc::clone(&mongo_provider)),
      jwt_secret,
    ));
    let login_service = AuthLoginService::new(
      json_provider.clone(),
      Some(Arc::clone(&mongo_provider)),
      Arc::clone(&token_service),
    );
    let register_service = AuthRegisterService::new(
      json_provider.clone(),
      Some(Arc::clone(&mongo_provider)),
      Arc::clone(&token_service),
    );
    let password_service =
      AuthPasswordService::new(json_provider.clone(), Some(mongo_provider.clone()));
    let totp_service = AuthTotpService::new(
      json_provider.clone(),
      Some(mongo_provider.clone()),
      Some(Arc::clone(&token_service)),
    );

    let rp_origin = Url::parse(&format!("https://{}", rp_domain)).expect("Invalid RP origin URL");
    let webauthn_state = Arc::new(WebAuthnState::new(&rp_domain, &rp_origin));

    let passkey_service = AuthPasskeyService::new(
      json_provider.clone(),
      Some(mongo_provider.clone()),
      Arc::clone(&webauthn_state),
    );
    let biometric_service =
      AuthBiometricService::new(json_provider.clone(), Some(mongo_provider.clone()));
    let qr_auth_service = QrAuthService::new(
      json_provider.clone(),
      Some(mongo_provider.clone()),
      Arc::clone(&token_service),
    );

    Self {
      token_service,
      login_service,
      register_service,
      password_service,
      totp_service,
      passkey_service,
      biometric_service,
      qr_auth_service,
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

  pub async fn setup_totp(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.totp_service.setup_totp(&username).await
  }

  pub async fn enable_totp(
    &self,
    username: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.totp_service.enable_totp(&username, &code).await
  }

  pub async fn verify_login_totp(
    &self,
    username: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.totp_service.verify_login_totp(&username, &code).await
  }

  pub async fn disable_totp(
    &self,
    username: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.totp_service.disable_totp(&username, &code).await
  }

  pub async fn use_recovery_code(
    &self,
    username: String,
    code: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.totp_service.use_recovery_code(&username, &code).await
  }

  pub async fn init_passkey_registration(
    &self,
    username: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.passkey_service.init_registration(&username).await
  }

  pub async fn complete_passkey_registration(
    &self,
    username: String,
    response_json: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .passkey_service
      .complete_registration(&username, &response_json)
      .await
  }

  pub async fn init_passkey_authentication(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    self.passkey_service.init_authentication(username).await
  }

  pub async fn complete_passkey_authentication(
    &self,
    username: String,
    response_json: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .passkey_service
      .complete_authentication(&username, &response_json)
      .await
  }

  pub async fn disable_passkey(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.passkey_service.disable_passkey(&username).await
  }

  pub async fn enable_biometric(
    &self,
    username: String,
    credential_id: String,
    public_key: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .biometric_service
      .enable_biometric(&username, &credential_id, &public_key)
      .await
  }

  pub async fn init_biometric_auth(
    &self,
    username: Option<&str>,
  ) -> Result<ResponseModel, ResponseModel> {
    self.biometric_service.init_biometric_auth(username).await
  }

  pub async fn complete_biometric_auth(
    &self,
    username: String,
    signature: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .biometric_service
      .complete_biometric_auth(&username, &signature)
      .await
  }

  pub async fn disable_biometric(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.biometric_service.disable_biometric(&username).await
  }

  pub async fn init_totp_qr_login(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.totp_service.init_totp_qr_login(&username).await
  }

  pub async fn qr_generate(
    &self,
    username: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .qr_auth_service
      .generate_qr_token(username.as_deref())
      .await
  }

  pub async fn qr_generate_for_desktop(
    &self,
    username: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .qr_auth_service
      .generate_qr_token_for_desktop_login(&username)
      .await
  }

  pub async fn qr_approve(
    &self,
    token: String,
    username: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .qr_auth_service
      .approve_qr_token(&token, &username)
      .await
  }

  pub async fn qr_status(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.qr_auth_service.get_qr_status(&token).await
  }

  pub async fn qr_toggle(
    &self,
    username: String,
    enabled: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .qr_auth_service
      .toggle_qr_login(&username, enabled)
      .await
  }

  pub async fn qr_login_complete(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.qr_auth_service.complete_qr_login(&token).await
  }
}
