use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::shared::types::{TaskCreateRequest, TaskUpdateRequest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_task(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());
  state.task_service.get_by_id(&id).await
}

#[tauri::command]
pub async fn get_tasks(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());
  let skip = page.map(|p| p * limit.unwrap_or(20));
  let limit = limit.or(Some(20));
  state.task_service.get_all(filter, skip, limit).await
}

#[tauri::command]
pub async fn create_task(
  state: State<'_, AppState>,
  data: TaskCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.task_service.create(data_value).await
}

#[tauri::command]
pub async fn update_task(
  state: State<'_, AppState>,
  id: String,
  data: TaskUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.task_service.update(&id, data_value).await
}

#[tauri::command]
pub async fn delete_task(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  state.task_service.delete(&id).await
}
