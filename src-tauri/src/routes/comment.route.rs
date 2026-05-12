use crate::entities::response_entity::ResponseModel;
use crate::routes::crud_helpers as crud;
use crate::shared::types::{CommentCreateRequest, CommentUpdateRequest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_comment(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get(&state, "comments", id, None, None, token).await
}

#[tauri::command]
pub async fn get_comments(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get_all(&state, "comments", page, limit, None, filter, None, token).await
}

#[tauri::command]
pub async fn create_comment(
  state: State<'_, AppState>,
  data: CommentCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_create(&state, "comments", data, None, token).await
}

#[tauri::command]
pub async fn update_comment(
  state: State<'_, AppState>,
  id: String,
  data: CommentUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_update(&state, "comments", id, data, None, token).await
}

#[tauri::command]
pub async fn delete_comment(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_delete(&state, "comments", id, None, token).await
}
