/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{login_form_model::LoginForm, response::ResponseModel, signup_form_model::SignupForm},
  AppState,
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
