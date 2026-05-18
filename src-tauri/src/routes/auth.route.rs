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
pub async fn change_password(
  state: State<'_, AppState>,
  token: String,
  new_password: String,
) -> Result<ResponseModel, ResponseModel> {
  let user_id =
    crate::helpers::auth_helper::extract_user_from_token(&token, &state.config_helper.jwt_secret)?;
  state
    .auth_service
    .password_service
    .change_password(user_id, new_password)
    .await
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
pub async fn get_user_security_status(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

  let user = crate::helpers::auth_helper::find_user_by_username(
    &state.repository_service.json_provider,
    state.repository_service.mongodb_provider.as_ref(),
    &username,
  )
  .await?;

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Security status retrieved".to_string(),
    data: DataValue::Object(json!({
      "totp_enabled": user.totp_enabled,
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
