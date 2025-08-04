/* services */
use crate::services::auth;

/* models */
use crate::models::{login_form::LoginForm, response::Response, signup_form::SignupForm};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn login(loginForm: LoginForm) -> Response {
  return auth::login(loginForm).await;
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn register(signupForm: SignupForm) -> Response {
  return auth::register(signupForm).await;
}
