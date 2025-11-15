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
  let authController = state.authController.clone();
  let result = authController.checkToken(token).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn login(
  state: State<'_, AppState>,
  loginForm: LoginForm,
) -> Result<ResponseModel, ResponseModel> {
  let authController = state.authController.clone();
  let result = authController.login(loginForm).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn register(
  state: State<'_, AppState>,
  signupForm: SignupForm,
) -> Result<ResponseModel, ResponseModel> {
  let authController = state.authController.clone();
  let result = authController.register(signupForm).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn requestPasswordReset(
  state: State<'_, AppState>,
  email: String,
) -> Result<ResponseModel, ResponseModel> {
  let authController = state.authController.clone();
  let result = authController.requestPasswordReset(email).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn verifyCode(
  state: State<'_, AppState>,
  email: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  let authController = state.authController.clone();
  let result = authController.verifyCode(email, code).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn resetPassword(
  state: State<'_, AppState>,
  resetData: PasswordReset,
) -> Result<ResponseModel, ResponseModel> {
  let authController = state.authController.clone();
  let result = authController.resetPassword(resetData).await;
  result
}
