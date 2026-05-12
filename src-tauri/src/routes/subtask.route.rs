use crate::entities::response_entity::ResponseModel;
use crate::shared::types::{SubtaskCreateRequest, SubtaskUpdateRequest};
use crate::AppState;
use crate::routes::crud_helpers as crud;
use tauri::State;

#[tauri::command]
pub async fn get_subtask(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get(&state, "subtasks", id, None, None, token).await
}

#[tauri::command]
pub async fn get_subtasks(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get_all(&state, "subtasks", page, limit, None, filter, None, token).await
}

#[tauri::command]
pub async fn create_subtask(
  state: State<'_, AppState>,
  data: SubtaskCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_create(&state, "subtasks", data, None, token).await
}

#[tauri::command]
pub async fn update_subtask(
  state: State<'_, AppState>,
  id: String,
  data: SubtaskUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_update(&state, "subtasks", id, data, None, token).await
}

#[tauri::command]
pub async fn delete_subtask(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_delete(&state, "subtasks", id, None, token).await
}