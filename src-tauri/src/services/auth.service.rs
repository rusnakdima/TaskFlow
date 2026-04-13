/* sys lib */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* services */
use super::auth::auth_biometric::AuthBiometricService;
use super::auth::auth_login::AuthLoginService;
use super::auth::auth_password::AuthPasswordService;
use super::auth::auth_passkey::AuthPasskeyService;
use super::auth::auth_qr::QrAuthService;
use super::auth::auth_register::AuthRegisterService;
use super::auth::auth_token::AuthTokenService;
use super::auth::auth_totp::AuthTotpService;

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
  pub totpService: AuthTotpService,
  pub passkeyService: AuthPasskeyService,
  pub biometricService: AuthBiometricService,
  pub qrAuthService: QrAuthService,
}

impl AuthService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    jwtSecret: String,
  ) -> Self {
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
    let registerService = AuthRegisterService::new(
      jsonProvider.clone(),
      Some(Arc::clone(&mongoProvider)),
      Arc::clone(&tokenService),
    );
    let passwordService = AuthPasswordService::new(jsonProvider.clone(), Some(mongoProvider.clone()));
    let totpService = AuthTotpService::new(jsonProvider.clone(), Some(mongoProvider.clone()), Some(Arc::clone(&tokenService)));
    let passkeyService = AuthPasskeyService::new(jsonProvider.clone(), Some(mongoProvider.clone()));
    let biometricService = AuthBiometricService::new(jsonProvider.clone(), Some(mongoProvider.clone()));
    let qrAuthService = QrAuthService::new(jsonProvider.clone(), Some(mongoProvider.clone()), Arc::clone(&tokenService));

    Self {
      tokenService,
      loginService,
      registerService,
      passwordService,
      totpService,
      passkeyService,
      biometricService,
      qrAuthService,
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

  pub async fn setupTotp(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.totpService.setupTotp(&username).await
  }

  pub async fn enableTotp(&self, username: String, code: String) -> Result<ResponseModel, ResponseModel> {
    self.totpService.enableTotp(&username, &code).await
  }

  pub async fn verifyLoginTotp(&self, username: String, code: String) -> Result<ResponseModel, ResponseModel> {
    self.totpService.verifyLoginTotp(&username, &code).await
  }

  pub async fn disableTotp(&self, username: String, code: String) -> Result<ResponseModel, ResponseModel> {
    self.totpService.disableTotp(&username, &code).await
  }

  pub async fn useRecoveryCode(&self, username: String, code: String) -> Result<ResponseModel, ResponseModel> {
    self.totpService.useRecoveryCode(&username, &code).await
  }

  pub async fn initPasskeyRegistration(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.passkeyService.initRegistration(&username).await
  }

  pub async fn completePasskeyRegistration(&self, username: String, credentialId: String, attestationObject: String, device: String) -> Result<ResponseModel, ResponseModel> {
    self.passkeyService.completeRegistration(&username, &credentialId, &attestationObject, &device).await
  }

  pub async fn initPasskeyAuthentication(&self, username: Option<&str>) -> Result<ResponseModel, ResponseModel> {
    self.passkeyService.initAuthentication(username).await
  }

  pub async fn completePasskeyAuthentication(&self, username: Option<String>, signature: String, authenticatorData: String, clientData: String) -> Result<ResponseModel, ResponseModel> {
    self.passkeyService.completeAuthentication(username.as_deref(), &signature, &authenticatorData, &clientData).await
  }

  pub async fn disablePasskey(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.passkeyService.disablePasskey(&username).await
  }

  pub async fn enableBiometric(&self, username: String, credentialId: String, publicKey: String) -> Result<ResponseModel, ResponseModel> {
    self.biometricService.enableBiometric(&username, &credentialId, &publicKey).await
  }

  pub async fn initBiometricAuth(&self, username: Option<&str>) -> Result<ResponseModel, ResponseModel> {
    self.biometricService.initBiometricAuth(username).await
  }

  pub async fn completeBiometricAuth(&self, username: String, signature: String) -> Result<ResponseModel, ResponseModel> {
    self.biometricService.completeBiometricAuth(&username, &signature).await
  }

  pub async fn disableBiometric(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.biometricService.disableBiometric(&username).await
  }

  pub async fn initTotpQrLogin(&self, username: String) -> Result<ResponseModel, ResponseModel> {
    self.totpService.initTotpQrLogin(&username).await
  }

  pub async fn qrGenerate(&self, username: Option<String>) -> Result<ResponseModel, ResponseModel> {
    self.qrAuthService.generateQrToken(username.as_deref()).await
  }

  pub async fn qrApprove(&self, token: String, username: String) -> Result<ResponseModel, ResponseModel> {
    self.qrAuthService.approveQrToken(&token, &username).await
  }

  pub async fn qrStatus(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.qrAuthService.getQrStatus(&token).await
  }

  pub async fn qrToggle(&self, username: String, enabled: bool) -> Result<ResponseModel, ResponseModel> {
    self.qrAuthService.toggleQrLogin(&username, enabled).await
  }

  pub async fn qrLoginComplete(&self, token: String) -> Result<ResponseModel, ResponseModel> {
    self.qrAuthService.completeQrLogin(&token).await
  }
}
