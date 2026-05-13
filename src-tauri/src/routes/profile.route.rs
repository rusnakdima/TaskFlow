use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::shared::types::{ProfileCreateRequest, ProfileUpdateRequest};
use crate::AppState;

use tauri::State;

#[tauri::command]
pub async fn get_profile(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_visibility = visibility.as_deref().unwrap_or("private");
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(t, &state.config_helper.jwt_secret).ok());

  state
    .repository_service
    .execute(
      "get".to_string(),
      "profiles".to_string(),
      Some(id),
      None,
      None,
      Some("user".to_string()),
      Some(effective_visibility.to_string()),
      false,
      user_id,
      None,
      None,
    )
    .await
}

#[tauri::command]
pub async fn get_profiles(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_visibility = visibility.as_deref().unwrap_or("private");
  let page = page.unwrap_or(0);
  let limit = std::cmp::min(limit.unwrap_or(10), 10);
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(t, &state.config_helper.jwt_secret).ok());

  let skip = Some(page * limit);
  let limit_opt = Some(limit);
  let result = state
    .repository_service
    .execute(
      "getAll".to_string(),
      "profiles".to_string(),
      None,
      None,
      filter,
      Some("user".to_string()),
      Some(effective_visibility.to_string()),
      false,
      user_id,
      skip,
      limit_opt,
    )
    .await;

  match result {
    Ok(mut response) => {
      let items_data = response.data;
      let paginated = serde_json::json!({
          "items": items_data,
          "page": page,
          "limit": limit,
          "has_more": true
      });
      response.data = DataValue::Object(paginated);
      Ok(response)
    }
    Err(e) => Err(err_response(&e.message)),
  }
}

#[tauri::command]
pub async fn create_profile(
  state: State<'_, AppState>,
  data: ProfileCreateRequest,
) -> Result<ResponseModel, ResponseModel> {
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  state
    .repository_service
    .execute(
      "create".to_string(),
      "profiles".to_string(),
      None,
      Some(data_value),
      None,
      None,
      Some("private".to_string()),
      false,
      None,
      None,
      None,
    )
    .await
}

#[tauri::command]
pub async fn update_profile(
  state: State<'_, AppState>,
  id: String,
  data: ProfileUpdateRequest,
) -> Result<ResponseModel, ResponseModel> {
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  state
    .repository_service
    .execute(
      "update".to_string(),
      "profiles".to_string(),
      Some(id),
      Some(data_value),
      None,
      None,
      Some("private".to_string()),
      false,
      None,
      None,
      None,
    )
    .await
}

#[tauri::command]
pub async fn delete_profile(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .repository_service
    .execute(
      "delete".to_string(),
      "profiles".to_string(),
      Some(id),
      None,
      None,
      None,
      Some("private".to_string()),
      false,
      None,
      None,
      None,
    )
    .await
}
