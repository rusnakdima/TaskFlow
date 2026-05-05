/* sys lib */
use std::sync::Arc;
use tauri::State;

use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, err_response_formatted, success_response};
use crate::providers::mongodb_provider::MongoProvider;
use crate::services::github_service::GithubService;
use crate::AppState;

/* entities */
use crate::entities::user_entity::UserEntity;

/* nosql_orm */
use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use serde_json::json;

async fn get_user_github_token(
  state: &AppState,
  user_id: &str,
) -> Result<(String, UserEntity), ResponseModel> {
  let table_name = "users";
  let filter = Filter::Eq("id".to_string(), json!(user_id));

  let user_val = state
    .repository_service
    .json_provider
    .find_many(table_name, Some(&filter), None, None, None, true)
    .await
    .map_err(|e| err_response_formatted("Database error", &e.to_string()))?
    .into_iter()
    .next()
    .ok_or_else(|| err_response("User not found"))?;

  let user = serde_json::from_value::<UserEntity>(user_val)
    .map_err(|e| err_response_formatted("Failed to parse user", &e.to_string()))?;

  if user.github_access_token.is_empty() {
    return Err(err_response("GitHub not connected"));
  }

  Ok((user.github_access_token.clone(), user))
}

async fn update_user_github_tokens(
  json_provider: &nosql_orm::providers::JsonProvider,
  mongo_provider: Option<&Arc<MongoProvider>>,
  user_id: &str,
  access_token: &str,
  refresh_token: &str,
  expires_in: i64,
  github_user_id: &str,
  github_username: &str,
) -> Result<(), ResponseModel> {
  let table_name = "users";
  let filter = Filter::Eq("id".to_string(), json!(user_id));

  let update_data = json!({
    "github_access_token": access_token,
    "github_refresh_token": refresh_token,
    "github_token_expiry": (chrono::Utc::now().timestamp() + expires_in).to_string(),
    "github_user_id": github_user_id,
    "github_username": github_username
  });

  json_provider
    .update(table_name, user_id, update_data.clone())
    .await
    .map_err(|e| err_response_formatted("Failed to update user", &e.to_string()))?;

  if let Some(mongo) = mongo_provider {
    let _ = mongo.update(table_name, user_id, update_data).await;
  }

  Ok(())
}

#[tauri::command]
pub async fn github_oauth_url(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let github_client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_else(|_| {
    eprintln!("WARNING: GITHUB_CLIENT_ID not set in .env");
    "".to_string()
  });

  if github_client_id.is_empty() {
    return Err(err_response("GitHub OAuth not configured"));
  }

  let redirect_uri = std::env::var("GITHUB_CALLBACK_URL").unwrap_or_else(|_| {
    let config_helper = &state.config_helper;
    format!("https://{}/github/callback", config_helper.rp_domain)
  });

  let service = GithubService::new();
  let url = service
    .get_authorization_url(&github_client_id, &redirect_uri)
    .await;

  Ok(success_response(DataValue::String(url)))
}

#[tauri::command]
pub async fn github_oauth_callback(
  state: State<'_, AppState>,
  user_id: String,
  code: String,
) -> Result<ResponseModel, ResponseModel> {
  let github_client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_else(|_| {
    eprintln!("WARNING: GITHUB_CLIENT_ID not set in .env");
    "".to_string()
  });

  let github_client_secret = std::env::var("GITHUB_CLIENT_SECRET").unwrap_or_else(|_| {
    eprintln!("WARNING: GITHUB_CLIENT_SECRET not set in .env");
    "".to_string()
  });

  if github_client_id.is_empty() || github_client_secret.is_empty() {
    return Err(err_response("GitHub OAuth not configured"));
  }

  let service = GithubService::new();
  let tokens = service
    .exchange_code_for_token(&github_client_id, &github_client_secret, &code)
    .await
    .map_err(|e| err_response_formatted("GitHub OAuth failed", &e))?;

  let github_user = service
    .get_user(&tokens.access_token)
    .await
    .map_err(|e| err_response_formatted("Failed to get GitHub user", &e))?;

  let _ = update_user_github_tokens(
    &state.repository_service.json_provider,
    state.repository_service.mongodb_provider.as_ref(),
    &user_id,
    &tokens.access_token,
    &tokens.refresh_token,
    tokens.expires_in,
    &github_user.id.to_string(),
    &github_user.login,
  )
  .await;

  Ok(success_response(DataValue::Object(json!({
    "username": github_user.login,
    "user_id": github_user.id.to_string(),
    "avatar_url": github_user.avatar_url
  }))))
}

#[tauri::command]
pub async fn github_get_repos(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
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

  Ok(success_response(DataValue::Array(repo_list)))
}

#[tauri::command]
pub async fn github_get_connection_status(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  match get_user_github_token(&state, &user_id).await {
    Ok((_, user)) => Ok(success_response(DataValue::Object(json!({
      "connected": true,
      "username": user.github_username,
      "user_id": user.github_user_id
    })))),
    Err(_) => Ok(success_response(DataValue::Object(json!({
      "connected": false
    })))),
  }
}

#[tauri::command]
pub async fn github_disconnect(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  let table_name = "users";

  let update_data = json!({
    "github_access_token": "",
    "github_refresh_token": "",
    "github_token_expiry": "",
    "github_user_id": "",
    "github_username": ""
  });

  state
    .repository_service
    .json_provider
    .update(table_name, &user_id, update_data.clone())
    .await
    .map_err(|e| err_response_formatted("Failed to update user", &e.to_string()))?;

  if let Some(mongo) = state.repository_service.mongodb_provider.as_ref() {
    let _ = mongo.update(table_name, &user_id, update_data).await;
  }

  Ok(success_response(DataValue::String(
    "Disconnected".to_string(),
  )))
}

#[tauri::command]
pub async fn github_create_issue(
  state: State<'_, AppState>,
  user_id: String,
  repo_owner: String,
  repo_name: String,
  title: String,
  body: String,
) -> Result<ResponseModel, ResponseModel> {
  let (access_token, _) = get_user_github_token(&state, &user_id).await?;

  let service = GithubService::new();
  let issue = service
    .create_issue(&access_token, &repo_owner, &repo_name, &title, &body)
    .await
    .map_err(|e| err_response_formatted("Failed to create issue", &e))?;

  Ok(success_response(DataValue::Object(json!({
    "id": issue.id,
    "number": issue.number,
    "html_url": issue.html_url,
    "title": issue.title
  }))))
}

#[tauri::command]
pub async fn github_create_comment(
  state: State<'_, AppState>,
  user_id: String,
  repo_owner: String,
  repo_name: String,
  issue_number: i64,
  body: String,
) -> Result<ResponseModel, ResponseModel> {
  let (access_token, _) = get_user_github_token(&state, &user_id).await?;

  let service = GithubService::new();
  let comment = service
    .create_comment(&access_token, &repo_owner, &repo_name, issue_number, &body)
    .await
    .map_err(|e| err_response_formatted("Failed to create comment", &e))?;

  Ok(success_response(DataValue::Object(json!({
    "id": comment.id,
    "html_url": comment.html_url
  }))))
}
