use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::shared::types::{CategoryCreateRequest, CategoryUpdateRequest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_category(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .unwrap_or_default();

  state.category_service.get_by_id(&id, &user_id).await
}

#[tauri::command]
pub async fn get_categories(
  state: State<'_, AppState>,
  skip: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .unwrap_or_default();

  let effective_visibility = visibility.as_deref().unwrap_or("private");

  state
    .category_service
    .get_all(&user_id, effective_visibility, filter, skip, limit)
    .await
}

#[tauri::command]
pub async fn create_category(
  state: State<'_, AppState>,
  data: CategoryCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;

  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.category_service.create(data_value).await
}

#[tauri::command]
pub async fn update_category(
  state: State<'_, AppState>,
  id: String,
  data: CategoryUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;

  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.category_service.update(&id, data_value).await
}

#[tauri::command]
pub async fn delete_category(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;

  state.category_service.delete(&id).await
}
