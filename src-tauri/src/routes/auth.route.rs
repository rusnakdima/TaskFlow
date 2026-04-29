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
pub async fn check_token(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth_service.check_token(token).await
}

#[tauri::command]
pub async fn login(
  state: State<'_, AppState>,
  login_form: LoginForm,
) -> Result<ResponseModel, ResponseModel> {
  state.auth_service.login(login_form).await
}

#[tauri::command]
pub async fn register(
  state: State<'_, AppState>,
  signup_form: SignupForm,
) -> Result<ResponseModel, ResponseModel> {
  state.auth_service.register(signup_form).await
}

#[tauri::command]
pub async fn request_password_reset(
  state: State<'_, AppState>,
  email: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth_service
    .request_password_reset(email, &state.config_helper)
    .await
}

#[tauri::command]
pub async fn verify_code(
  state: State<'_, AppState>,
  email: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth_service.verify_code(email, code).await
}

#[tauri::command]
pub async fn reset_password(
  state: State<'_, AppState>,
  reset_data: PasswordReset,
) -> Result<ResponseModel, ResponseModel> {
  state.auth_service.reset_password(reset_data).await
}

#[tauri::command]
pub async fn setup_totp(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.totp_service.setup_totp(&username).await
}

#[tauri::command]
pub async fn enable_totp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.totp_service.enable_totp(&username, &code).await
}

#[tauri::command]
pub async fn verify_login_totp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.totp_service.verify_login_totp(&username, &code).await
}

#[tauri::command]
pub async fn disable_totp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.totp_service.disable_totp(&username, &code).await
}

#[tauri::command]
pub async fn use_recovery_code(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.totp_service.use_recovery_code(&username, &code).await
}

#[tauri::command]
pub async fn init_totp_qr_login(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.totp_service.init_totp_qr_login(&username).await
}

#[tauri::command]
pub async fn init_passkey_registration(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.passkey_service.init_registration(&username).await
}

#[tauri::command]
pub async fn complete_passkey_registration(
  state: State<'_, AppState>,
  username: String,
  response_json: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .passkey_service
    .complete_registration(&username, &response_json)
    .await
}

#[tauri::command]
pub async fn init_passkey_authentication(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .passkey_service
    .init_authentication(username.as_deref())
    .await
}

#[tauri::command]
pub async fn complete_passkey_authentication(
  state: State<'_, AppState>,
  username: String,
  response_json: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .passkey_service
    .complete_authentication(&username, &response_json)
    .await
}

#[tauri::command]
pub async fn disable_passkey(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.passkey_service.disable_passkey(&username).await
}

#[tauri::command]
pub async fn enable_biometric(
  state: State<'_, AppState>,
  username: String,
  credential_id: String,
  public_key: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .biometric_service
    .enable_biometric(&username, &credential_id, &public_key)
    .await
}

#[tauri::command]
pub async fn init_biometric_auth(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .biometric_service
    .init_biometric_auth(username.as_deref())
    .await
}

#[tauri::command]
pub async fn complete_biometric_auth(
  state: State<'_, AppState>,
  username: String,
  signature: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .biometric_service
    .complete_biometric_auth(&username, &signature)
    .await
}

#[tauri::command]
pub async fn disable_biometric(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.biometric_service.disable_biometric(&username).await
}

// TODO [API v2]: get_user_security_status takes `_username` parameter that's ignored.
// The function always retrieves the first user found, ignoring the provided username parameter.
// Should either use the parameter or remove it (breaking change).

#[tauri::command]
pub async fn get_user_security_status(
  state: State<'_, AppState>,
  _username: String,
) -> Result<ResponseModel, ResponseModel> {
  use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};
  use crate::entities::user_entity::UserEntity;
  use crate::helpers::response_helper::err_response;
  use nosql_orm::provider::DatabaseProvider;

  let user_result: Option<UserEntity> = match state
    .repository_service
    .json_provider
    .find_all("users")
    .await
  {
    Ok(users) => {
      if let Some(user_val) = users.first() {
        serde_json::from_value(user_val.clone()).ok()
      } else {
        None
      }
    }
    Err(_) => None,
  };

  let user = if let Some(user) = user_result {
    user
  } else if let Some(ref mongo) = state.repository_service.mongodb_provider {
    match mongo.find_all("users").await {
      Ok(users) => {
        if let Some(user_val) = users.first() {
          serde_json::from_value(user_val.clone())
            .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?
        } else {
          return Err(err_response("User not found"));
        }
      }
      Err(e) => return Err(err_response(&format!("Database error: {}", e))),
    }
  } else {
    return Err(err_response("User not found"));
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
pub async fn qr_generate(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .qr_auth_service
    .generate_qr_token(username.as_deref())
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn qr_generate_for_desktop(
  state: State<'_, AppState>,
  username: String,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .qr_auth_service
    .generate_qr_token_for_desktop_login(&username, &user_id)
    .await
}

#[tauri::command]
pub async fn qr_approve(
  state: State<'_, AppState>,
  token: String,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .qr_auth_service
    .approve_qr_token(&token, &username)
    .await
}

#[tauri::command]
pub async fn qr_status(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.qr_auth_service.get_qr_status(&token).await
}

#[tauri::command]
pub async fn qr_toggle(
  state: State<'_, AppState>,
  username: String,
  enabled: bool,
) -> Result<ResponseModel, ResponseModel> {
  state
    .qr_auth_service
    .toggle_qr_login(&username, enabled)
    .await
}

#[tauri::command]
pub async fn qr_login_complete(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.qr_auth_service.complete_qr_login(&token).await
}

#[cfg(target_os = "android")]
#[tauri::command]
pub fn check_android_biometric() -> Result<ResponseModel, ResponseModel> {
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
pub fn authenticate_android_biometric(
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
pub fn check_android_biometric() -> Result<ResponseModel, ResponseModel> {
  Ok(ResponseModel {
    status: crate::entities::response_entity::ResponseStatus::Success,
    message: "Not Android".to_string(),
    data: crate::entities::response_entity::DataValue::Bool(false),
  })
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn authenticate_android_biometric(
  _title: String,
  _subtitle: String,
) -> Result<ResponseModel, ResponseModel> {
  Ok(ResponseModel {
    status: crate::entities::response_entity::ResponseStatus::Error,
    message: "Not Android".to_string(),
    data: crate::entities::response_entity::DataValue::Bool(false),
  })
}
