/* sys lib */
use crate::AppState;
use serde_json::json;
use tauri::State;

/* models */
use crate::entities::{
  login_form_entity::LoginForm, password_reset::PasswordReset, response_entity::ResponseModel,
  signup_form_entity::SignupForm,
};

#[tauri::command]
pub async fn checkToken(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.checkToken(token).await
}

#[tauri::command]
pub async fn login(
  state: State<'_, AppState>,
  loginForm: LoginForm,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.login(loginForm).await
}

#[tauri::command]
pub async fn register(
  state: State<'_, AppState>,
  signupForm: SignupForm,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.register(signupForm).await
}

#[tauri::command]
pub async fn requestPasswordReset(
  state: State<'_, AppState>,
  email: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .requestPasswordReset(email, &state.configHelper)
    .await
}

#[tauri::command]
pub async fn verifyCode(
  state: State<'_, AppState>,
  email: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.verifyCode(email, code).await
}

#[tauri::command]
pub async fn resetPassword(
  state: State<'_, AppState>,
  resetData: PasswordReset,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.resetPassword(resetData).await
}

#[tauri::command]
pub async fn setupTotp(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.setupTotp(username).await
}

#[tauri::command]
pub async fn enableTotp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.enableTotp(username, code).await
}

#[tauri::command]
pub async fn verifyLoginTotp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.verifyLoginTotp(username, code).await
}

#[tauri::command]
pub async fn disableTotp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.disableTotp(username, code).await
}

#[tauri::command]
pub async fn useRecoveryCode(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.useRecoveryCode(username, code).await
}

#[tauri::command]
pub async fn initPasskeyRegistration(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.initPasskeyRegistration(username).await
}

#[tauri::command]
pub async fn completePasskeyRegistration(
  state: State<'_, AppState>,
  username: String,
  responseJson: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .completePasskeyRegistration(username, responseJson)
    .await
}

#[tauri::command]
pub async fn initPasskeyAuthentication(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .initPasskeyAuthentication(username.as_ref().map(|s| s.as_str()))
    .await
}

#[tauri::command]
pub async fn completePasskeyAuthentication(
  state: State<'_, AppState>,
  username: String,
  responseJson: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .completePasskeyAuthentication(username, responseJson)
    .await
}

#[tauri::command]
pub async fn disablePasskey(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.disablePasskey(username).await
}

#[tauri::command]
pub async fn enableBiometric(
  state: State<'_, AppState>,
  username: String,
  credentialId: String,
  publicKey: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .enableBiometric(username, credentialId, publicKey)
    .await
}

#[tauri::command]
pub async fn initBiometricAuth(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .initBiometricAuth(username.as_ref().map(|s| s.as_str()))
    .await
}

#[tauri::command]
pub async fn completeBiometricAuth(
  state: State<'_, AppState>,
  username: String,
  signature: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .authService
    .completeBiometricAuth(username, signature)
    .await
}

#[tauri::command]
pub async fn disableBiometric(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.disableBiometric(username).await
}

#[tauri::command]
pub async fn initTotpQrLogin(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.initTotpQrLogin(username).await
}

#[tauri::command]
pub async fn getUserSecurityStatus(
  state: State<'_, AppState>,
  _username: String,
) -> Result<ResponseModel, ResponseModel> {
  use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};
  use crate::entities::user_entity::UserEntity;
  use crate::helpers::response_helper::errResponse;
  use nosql_orm::provider::DatabaseProvider;

  // Try JSON provider first
  let user_result: Option<UserEntity> =
    match state.repositoryService.jsonProvider.find_all("users").await {
      Ok(users) => {
        if let Some(user_val) = users.first() {
          serde_json::from_value(user_val.clone()).ok()
        } else {
          None
        }
      }
      Err(_) => None,
    };

  // Fall back to MongoDB
  let user = if let Some(user) = user_result {
    user
  } else if let Some(ref mongo) = state.repositoryService.mongodbProvider {
    match mongo.find_all("users").await {
      Ok(users) => {
        if let Some(user_val) = users.first() {
          serde_json::from_value(user_val.clone())
            .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?
        } else {
          return Err(errResponse("User not found"));
        }
      }
      Err(e) => return Err(errResponse(&format!("Database error: {}", e))),
    }
  } else {
    return Err(errResponse("User not found"));
  };

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Security status retrieved".to_string(),
    data: DataValue::Object(json!({
      "totp_enabled": user.totp_enabled,
      "passkey_enabled": user.passkey_enabled,
      "biometric_enabled": user.biometric_enabled,
      "qr_login_enabled": user.qr_login_enabled,
    })),
  })
}

#[tauri::command]
pub async fn qrGenerate(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.qrGenerate(username).await
}

#[tauri::command]
pub async fn qrGenerateForDesktop(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.qrGenerateForDesktop(username).await
}

#[tauri::command]
pub async fn qrApprove(
  state: State<'_, AppState>,
  token: String,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.qrApprove(token, username).await
}

#[tauri::command]
pub async fn qrStatus(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.qrStatus(token).await
}

#[tauri::command]
pub async fn qrToggle(
  state: State<'_, AppState>,
  username: String,
  enabled: bool,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.qrToggle(username, enabled).await
}

#[tauri::command]
pub async fn qrLoginComplete(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authService.qrLoginComplete(token).await
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn checkAndroidBiometric() -> Result<ResponseModel, ResponseModel> {
  match crate::services::auth::android_biometric::check_biometric_available() {
    Ok(available) => Ok(ResponseModel {
      status: crate::entities::response_entity::ResponseStatus::Success,
      message: if available {
        "Biometric available"
      } else {
        "Biometric not available"
      }
      .to_string(),
      data: crate::entities::response_entity::DataValue::Bool(available),
    }),
    Err(e) => Err(ResponseModel {
      status: crate::entities::response_entity::ResponseStatus::Error,
      message: e,
      data: crate::entities::response_entity::DataValue::Bool(false),
    }),
  }
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn authenticateAndroidBiometric(
  title: String,
  subtitle: String,
) -> Result<ResponseModel, ResponseModel> {
  match crate::services::auth::android_biometric::authenticate_biometric(&title, &subtitle) {
    Ok(success) => Ok(ResponseModel {
      status: crate::entities::response_entity::ResponseStatus::Success,
      message: if success {
        "Authentication successful"
      } else {
        "Authentication failed"
      }
      .to_string(),
      data: crate::entities::response_entity::DataValue::Bool(success),
    }),
    Err(e) => Err(ResponseModel {
      status: crate::entities::response_entity::ResponseStatus::Error,
      message: e,
      data: crate::entities::response_entity::DataValue::Bool(false),
    }),
  }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn checkAndroidBiometric() -> Result<ResponseModel, ResponseModel> {
  Ok(ResponseModel {
    status: crate::entities::response_entity::ResponseStatus::Success,
    message: "Not Android".to_string(),
    data: crate::entities::response_entity::DataValue::Bool(false),
  })
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn authenticateAndroidBiometric(
  _title: String,
  _subtitle: String,
) -> Result<ResponseModel, ResponseModel> {
  Ok(ResponseModel {
    status: crate::entities::response_entity::ResponseStatus::Error,
    message: "Not Android".to_string(),
    data: crate::entities::response_entity::DataValue::Bool(false),
  })
}
