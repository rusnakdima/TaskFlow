use crate::entities::response_entity::ResponseModel;
use crate::shared::types::{TaskCreateRequest, TaskUpdateRequest};
use crate::AppState;
use crate::routes::crud_helpers as crud;
use tauri::State;

#[tauri::command]
pub async fn get_task(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get(&state, "tasks", id, None, None, token).await
}

#[tauri::command]
pub async fn get_tasks(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get_all(&state, "tasks", page, limit, None, filter, None, token).await
}

#[tauri::command]
pub async fn create_task(
  state: State<'_, AppState>,
  data: TaskCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_create(&state, "tasks", data, None, token).await
}

#[tauri::command]
pub async fn update_task(
  state: State<'_, AppState>,
  id: String,
  data: TaskUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_update(&state, "tasks", id, data, None, token).await
}

#[tauri::command]
pub async fn delete_task(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_delete(&state, "tasks", id, None, token).await
}