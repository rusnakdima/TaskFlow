use crate::entities::response_entity::ResponseModel;
use crate::shared::types::{ChatCreateRequest, ChatUpdateRequest};
use crate::AppState;
use crate::routes::crud_helpers as crud;
use tauri::State;

#[tauri::command]
pub async fn get_chat(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get(&state, "chats", id, None, None, token).await
}

#[tauri::command]
pub async fn get_chats(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get_all(&state, "chats", page, limit, None, filter, None, token).await
}

#[tauri::command]
pub async fn create_chat(
  state: State<'_, AppState>,
  data: ChatCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_create(&state, "chats", data, None, token).await
}

#[tauri::command]
pub async fn update_chat(
  state: State<'_, AppState>,
  id: String,
  data: ChatUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_update(&state, "chats", id, data, None, token).await
}

#[tauri::command]
pub async fn delete_chat(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_delete(&state, "chats", id, None, token).await
}