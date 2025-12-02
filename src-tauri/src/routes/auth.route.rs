/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  login_form_model::LoginForm, password_reset::PasswordReset, response_model::ResponseModel,
  signup_form_model::SignupForm,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn checkToken(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authController.checkToken(token).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn login(
  state: State<'_, AppState>,
  loginForm: LoginForm,
) -> Result<ResponseModel, ResponseModel> {
  state.authController.login(loginForm).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn register(
  state: State<'_, AppState>,
  signupForm: SignupForm,
) -> Result<ResponseModel, ResponseModel> {
  state.authController.register(signupForm).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn requestPasswordReset(
  state: State<'_, AppState>,
  email: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authController.requestPasswordReset(email).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn verifyCode(
  state: State<'_, AppState>,
  email: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.authController.verifyCode(email, code).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn resetPassword(
  state: State<'_, AppState>,
  resetData: PasswordReset,
) -> Result<ResponseModel, ResponseModel> {
  state.authController.resetPassword(resetData).await
}
