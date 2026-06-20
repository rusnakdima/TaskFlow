use crate::entities::{
  login_form_entity::LoginForm, password_reset::PasswordReset, signup_form_entity::SignupForm,
};
use crate::models::response::ResponseModel;
use crate::AppState;
use tauri::State;
#[tauri::command]
pub async fn check_token(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.auth_service.check_token(token).await
}
#[tauri::command]
pub async fn login(
  state: State<'_, AppState>,
  login_form: LoginForm,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.auth_service.login(login_form).await
}
#[tauri::command]
pub async fn register(
  state: State<'_, AppState>,
  signup_form: SignupForm,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.auth_service.register(signup_form).await
}
#[tauri::command]
pub async fn request_password_reset(
  state: State<'_, AppState>,
  email: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth
    .auth_service
    .request_password_reset(email, &state.config.config_helper)
    .await
}
#[tauri::command]
pub async fn verify_code(
  state: State<'_, AppState>,
  email: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.auth_service.verify_code(email, code).await
}
#[tauri::command]
pub async fn reset_password(
  state: State<'_, AppState>,
  reset_data: PasswordReset,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.auth_service.reset_password(reset_data).await
}
#[tauri::command]
pub async fn change_password(
  state: State<'_, AppState>,
  token: String,
  new_password: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth
    .auth_service
    .change_password(&token, &state.config.config_helper.jwt_secret, new_password)
    .await
}
#[tauri::command]
pub async fn setup_totp(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.totp_service.setup_totp(&username).await
}
#[tauri::command]
pub async fn enable_totp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.totp_service.enable_totp(&username, &code).await
}
#[tauri::command]
pub async fn verify_login_totp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth
    .totp_service
    .verify_login_totp(&username, &code)
    .await
}
#[tauri::command]
pub async fn disable_totp(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.totp_service.disable_totp(&username, &code).await
}
#[tauri::command]
pub async fn use_recovery_code(
  state: State<'_, AppState>,
  username: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth
    .totp_service
    .use_recovery_code(&username, &code)
    .await
}
#[tauri::command]
pub async fn get_user_security_status(
  state: State<'_, AppState>,
  username: String,
) -> Result<ResponseModel, ResponseModel> {
  use crate::models::response::{ResponseModel, ResponseStatus};
  let user = crate::utils::auth::find_user_by_username(
    &state.config.json_provider,
    state.config.mongodb_provider.as_ref(),
    &username,
  )
  .await?;
  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Security status retrieved".to_string(),
    data: serde_json::json!({
      "totp_enabled": user.totp_enabled,
      "qr_login_enabled": user.qr_login_enabled,
    }),
  })
}
#[tauri::command]
pub async fn qr_generate(
  state: State<'_, AppState>,
  username: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth
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
    .auth
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
    .auth
    .qr_auth_service
    .approve_qr_token(&token, &username)
    .await
}
#[tauri::command]
pub async fn qr_status(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.qr_auth_service.get_qr_status(&token).await
}
#[tauri::command]
pub async fn qr_toggle(
  state: State<'_, AppState>,
  username: String,
  enabled: bool,
) -> Result<ResponseModel, ResponseModel> {
  state
    .auth
    .qr_auth_service
    .toggle_qr_login(&username, enabled)
    .await
}
#[tauri::command]
pub async fn qr_login_complete(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  state.auth.qr_auth_service.complete_qr_login(&token).await
}
#[tauri::command]
pub async fn initialize_user_data(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  let result = state
    .auth
    .auth_data_sync_service
    .initialize_user_data(&user_id)
    .await?;
  Ok(crate::utils::response_helper::success_response(
    serde_json::to_value(result).unwrap_or(serde_json::json!({})),
  ))
}
use crate::models::response::ResponseModel as Resp;
use crate::repositories::mongodb_provider::MongoProvider;
use crate::services::github_service::GithubService;
use crate::utils::response_helper::{err_response, err_response_formatted, success_response};
use crate::AppState as AppSt;
use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use serde_json::json;
use std::sync::Arc;
async fn get_user_github_token(
  state: &AppSt,
  user_id: &str,
) -> Result<(String, crate::entities::user_entity::UserEntity), Resp> {
  let table_name = "users";
  let filter = Filter::Eq("id".to_string(), json!(user_id));
  let user_val = state
    .data
    .repository_service
    .json_provider
    .find_many(table_name, Some(&filter), None, None, None, true)
    .await
    .map_err(|e| err_response_formatted("Database error", &e.to_string()))?
    .into_iter()
    .next()
    .ok_or_else(|| err_response("User not found"))?;
  let user = serde_json::from_value::<crate::entities::user_entity::UserEntity>(user_val)
    .map_err(|e| err_response_formatted("Failed to parse user", &e.to_string()))?;
  if user.github_access_token.is_empty() {
    return Err(err_response("GitHub not connected"));
  }
  Ok((user.github_access_token.clone(), user))
}
struct GithubTokenUpdate {
  user_id: String,
  access_token: String,
  refresh_token: String,
  expires_in: i64,
  github_user_id: String,
  github_username: String,
}
async fn update_user_github_tokens(
  json_provider: &nosql_orm::providers::JsonProvider,
  mongo_provider: Option<&Arc<MongoProvider>>,
  update: GithubTokenUpdate,
) -> Result<(), Resp> {
  let table_name = "users";
  let update_data = json!({
    "github_access_token": update.access_token,
    "github_refresh_token": update.refresh_token,
    "github_token_expiry": (chrono::Utc::now().timestamp() + update.expires_in).to_string(),
    "github_user_id": update.github_user_id,
    "github_username": update.github_username
  });
  json_provider
    .patch(table_name, &update.user_id, update_data.clone())
    .await
    .map_err(|e| err_response_formatted("Failed to patch user", &e.to_string()))?;
  if let Some(mongo) = mongo_provider {
    let _ = mongo.patch(table_name, &update.user_id, update_data).await;
  }
  Ok(())
}
#[tauri::command]
pub async fn github_oauth_url(state: State<'_, AppSt>) -> Result<Resp, Resp> {
  let client_id_github = state.config.config_helper.client_id_github.clone();
  if client_id_github.is_empty() {
    return Err(err_response(
      "GitHub OAuth not configured. Set CLIENT_ID_GITHUB in .env",
    ));
  }
  let redirect_uri = if state.config.config_helper.callback_url_github.is_empty() {
    format!(
      "https://{}/github/callback",
      state.config.config_helper.rp_domain
    )
  } else {
    state.config.config_helper.callback_url_github.clone()
  };
  let service = GithubService::new();
  let url = service
    .get_authorization_url(&client_id_github, &redirect_uri)
    .await;
  Ok(success_response(serde_json::json!(url)))
}
#[tauri::command]
pub async fn github_oauth_callback(
  state: State<'_, AppSt>,
  user_id: String,
  code: String,
) -> Result<Resp, Resp> {
  let client_id_github = state.config.config_helper.client_id_github.clone();
  let client_secret_github = state.config.config_helper.client_secret_github.clone();
  if client_id_github.is_empty() || client_secret_github.is_empty() {
    return Err(err_response(
      "GitHub OAuth not configured. Set CLIENT_ID_GITHUB and CLIENT_SECRET_GITHUB in .env",
    ));
  }
  let service = GithubService::new();
  let tokens = service
    .exchange_code_for_token(&client_id_github, &client_secret_github, &code)
    .await
    .map_err(|e| err_response_formatted("GitHub OAuth failed", &e))?;
  let github_user = service
    .get_user(&tokens.access_token)
    .await
    .map_err(|e| err_response_formatted("Failed to get GitHub user", &e))?;
  let github_username = github_user.login.clone();
  let _ = update_user_github_tokens(
    &state.data.repository_service.json_provider,
    state.data.repository_service.mongodb_provider.as_ref(),
    GithubTokenUpdate {
      user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      github_user_id: github_user.id.to_string(),
      github_username,
    },
  )
  .await;
  Ok(success_response(serde_json::json!({
    "username": github_user.login,
    "user_id": github_user.id.to_string(),
    "avatar_url": github_user.avatar_url
  })))
}
#[tauri::command]
pub async fn github_get_repos(state: State<'_, AppSt>, user_id: String) -> Result<Resp, Resp> {
  let (access_token, _user) = get_user_github_token(&state, &user_id).await?;
  let service = GithubService::new();
  let repos = service
    .get_repos(&access_token)
    .await
    .map_err(|e| err_response_formatted("Failed to get repos", &e))?;
  let repo_list: Vec<serde_json::Value> = repos
    .into_iter()
    .map(|r| {
      json!({
        "id": r.id,
        "name": r.name,
        "full_name": r.full_name,
        "private": r.private,
        "html_url": r.html_url,
        "description": r.description,
        "default_branch": r.default_branch
      })
    })
    .collect();
  Ok(success_response(serde_json::json!(repo_list)))
}
#[tauri::command]
pub async fn github_get_connection_status(
  state: State<'_, AppSt>,
  user_id: String,
) -> Result<Resp, Resp> {
  match get_user_github_token(&state, &user_id).await {
    Ok((_, user)) => Ok(success_response(serde_json::json!({
      "connected": true,
      "username": user.github_username,
      "user_id": user.github_user_id
    }))),
    Err(_) => Ok(success_response(serde_json::json!({
      "connected": false
    }))),
  }
}
#[tauri::command]
pub async fn github_disconnect(state: State<'_, AppSt>, user_id: String) -> Result<Resp, Resp> {
  let table_name = "users";
  let update_data = json!({
    "github_access_token": "",
    "github_refresh_token": "",
    "github_token_expiry": "",
    "github_user_id": "",
    "github_username": ""
  });
  state
    .data
    .repository_service
    .json_provider
    .patch(table_name, &user_id, update_data.clone())
    .await
    .map_err(|e| err_response_formatted("Failed to patch user", &e.to_string()))?;
  if let Some(mongo) = state.data.repository_service.mongodb_provider.as_ref() {
    let _ = mongo.patch(table_name, &user_id, update_data).await;
  }
  Ok(success_response(serde_json::json!("Disconnected")))
}
#[tauri::command]
pub async fn github_create_issue(
  state: State<'_, AppSt>,
  user_id: String,
  repo_owner: String,
  repo_name: String,
  title: String,
  body: String,
) -> Result<Resp, Resp> {
  let (access_token, _) = get_user_github_token(&state, &user_id).await?;
  let service = GithubService::new();
  let issue = service
    .create_issue(&access_token, &repo_owner, &repo_name, &title, &body)
    .await
    .map_err(|e| err_response_formatted("Failed to create issue", &e))?;
  Ok(success_response(serde_json::json!({
    "id": issue.id,
    "number": issue.number,
    "html_url": issue.html_url,
    "title": issue.title
  })))
}
#[tauri::command]
pub async fn github_create_comment(
  state: State<'_, AppSt>,
  user_id: String,
  repo_owner: String,
  repo_name: String,
  issue_number: i64,
  body: String,
) -> Result<Resp, Resp> {
  let (access_token, _) = get_user_github_token(&state, &user_id).await?;
  let service = GithubService::new();
  let comment = service
    .create_comment(&access_token, &repo_owner, &repo_name, issue_number, &body)
    .await
    .map_err(|e| err_response_formatted("Failed to create comment", &e))?;
  Ok(success_response(serde_json::json!({
    "id": comment.id,
    "html_url": comment.html_url
  })))
}
#[tauri::command]
pub async fn github_update_issue(
  state: State<'_, AppSt>,
  user_id: String,
  repo_owner: String,
  repo_name: String,
  issue_number: i64,
  title: String,
  body: String,
) -> Result<Resp, Resp> {
  let (access_token, _) = get_user_github_token(&state, &user_id).await?;
  let service = GithubService::new();
  let issue = service
    .update_issue(
      &access_token,
      &repo_owner,
      &repo_name,
      issue_number,
      &title,
      &body,
    )
    .await
    .map_err(|e| err_response_formatted("Failed to update issue", &e))?;
  Ok(success_response(serde_json::json!({
    "id": issue.id,
    "number": issue.number,
    "html_url": issue.html_url,
    "title": issue.title
  })))
}
#[tauri::command]
pub async fn github_start_device_flow(state: State<'_, AppSt>) -> Result<Resp, Resp> {
  let client_id_github = state.config.config_helper.client_id_github.clone();
  if client_id_github.is_empty() {
    return Err(err_response(
      "GitHub OAuth not configured. Set CLIENT_ID_GITHUB in .env",
    ));
  }
  let service = GithubService::new();
  let (device_code, user_code, verification_uri) = service
    .start_device_code_flow(&client_id_github)
    .await
    .map_err(|e| err_response_formatted("Failed to start device flow", &e))?;
  Ok(success_response(serde_json::json!({
    "device_code": device_code,
    "user_code": user_code,
    "verification_uri": verification_uri
  })))
}
#[tauri::command]
pub async fn github_check_device_flow(
  state: State<'_, AppSt>,
  device_code: String,
  user_id: String,
) -> Result<Resp, Resp> {
  let client_id_github = state.config.config_helper.client_id_github.clone();
  if client_id_github.is_empty() {
    return Err(err_response(
      "GitHub OAuth not configured. Set client_id_github in .env",
    ));
  }
  let service = GithubService::new();
  match service
    .check_device_code(&client_id_github, &device_code)
    .await
  {
    Ok(Some(tokens)) => {
      let github_user = service
        .get_user(&tokens.access_token)
        .await
        .map_err(|e| err_response_formatted("Failed to get GitHub user", &e))?;
      let access_token_clone = tokens.access_token.clone();
      let refresh_token_clone = tokens.refresh_token.clone();
      let expires_in_clone = tokens.expires_in;
      let _ = update_user_github_tokens(
        &state.data.repository_service.json_provider,
        state.data.repository_service.mongodb_provider.as_ref(),
        GithubTokenUpdate {
          user_id: user_id.clone(),
          access_token: access_token_clone,
          refresh_token: refresh_token_clone,
          expires_in: expires_in_clone,
          github_user_id: github_user.id.to_string(),
          github_username: github_user.login.clone(),
        },
      )
      .await;
      Ok(success_response(serde_json::json!({
        "success": true,
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "expires_in": tokens.expires_in,
        "username": github_user.login,
        "user_id": github_user.id.to_string(),
        "avatar_url": github_user.avatar_url
      })))
    }
    Ok(None) => Ok(success_response(serde_json::json!({
      "success": false,
      "pending": true
    }))),
    Err(e) => Err(err_response(&e)),
  }
}
