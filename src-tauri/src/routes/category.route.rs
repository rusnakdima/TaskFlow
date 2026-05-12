use crate::entities::response_entity::ResponseModel;
use crate::routes::crud_helpers as crud;
use crate::shared::types::{CategoryCreateRequest, CategoryUpdateRequest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_category(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_get(&state, "categories", id, None, None, token).await
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
  crud::handle_get_all(
    &state,
    "categories",
    skip,
    limit,
    visibility,
    filter,
    None,
    token,
  )
  .await
}

#[tauri::command]
pub async fn create_category(
  state: State<'_, AppState>,
  data: CategoryCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_create(&state, "categories", data, None, token).await
}

#[tauri::command]
pub async fn update_category(
  state: State<'_, AppState>,
  id: String,
  data: CategoryUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_update(&state, "categories", id, data, None, token).await
}

#[tauri::command]
pub async fn delete_category(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  crud::handle_delete(&state, "categories", id, None, token).await
}
