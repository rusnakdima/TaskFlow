/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  login_form_model::LoginForm,
  password_reset::PasswordReset,
  response_model::{
    ResponseModel, {DataValue, ResponseStatus},
  },
  signup_form_model::SignupForm,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn checkToken(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  match &state.authController {
    Some(authController) => {
      let result = authController.checkToken(token).await;
      result
    }
    None => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Authentication not available".to_string(),
      data: DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn login(
  state: State<'_, AppState>,
  loginForm: LoginForm,
) -> Result<ResponseModel, ResponseModel> {
  match &state.authController {
    Some(authController) => {
      let result = authController.login(loginForm).await;
      result
    }
    None => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Authentication not available".to_string(),
      data: DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn register(
  state: State<'_, AppState>,
  signupForm: SignupForm,
) -> Result<ResponseModel, ResponseModel> {
  match &state.authController {
    Some(authController) => {
      let result = authController.register(signupForm).await;
      result
    }
    None => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Authentication not available".to_string(),
      data: DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn requestPasswordReset(
  state: State<'_, AppState>,
  email: String,
) -> Result<ResponseModel, ResponseModel> {
  match &state.authController {
    Some(authController) => {
      let result = authController.requestPasswordReset(email).await;
      result
    }
    None => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Authentication not available".to_string(),
      data: DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn resetPassword(
  state: State<'_, AppState>,
  resetData: PasswordReset,
) -> Result<ResponseModel, ResponseModel> {
  match &state.authController {
    Some(authController) => {
      let result = authController.resetPassword(resetData).await;
      result
    }
    None => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Authentication not available".to_string(),
      data: DataValue::String("".to_string()),
    }),
  }
}
