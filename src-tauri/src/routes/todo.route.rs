use crate::entities::response_entity::ResponseModel;
use crate::shared::types::{TodoCreateRequest, TodoUpdateRequest};
use crate::AppState;
use crate::routes::crud_helpers as crud;
use tauri::State;

#[tauri::command]
pub async fn get_todo(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get(&state, "todos", id, None, None, token).await
}

#[tauri::command]
pub async fn get_todos(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get_all(&state, "todos", page, limit, visibility, filter, None, token).await
}

#[tauri::command]
pub async fn create_todo(
  state: State<'_, AppState>,
  data: TodoCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_create(&state, "todos", data, None, token).await
}

#[tauri::command]
pub async fn update_todo(
  state: State<'_, AppState>,
  id: String,
  data: TodoUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_update(&state, "todos", id, data, None, token).await
}

#[tauri::command]
pub async fn delete_todo(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_delete(&state, "todos", id, None, token).await
}