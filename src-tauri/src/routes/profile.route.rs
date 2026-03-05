/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileUpdateModel},
  response_model::ResponseModel,
};

#[tauri::command]
pub async fn profileGetAll(
  state: State<'_, AppState>,
  filter: Value,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.getAll(filter).await
}

#[tauri::command]
pub async fn profileGet(
  state: State<'_, AppState>,
  filter: Value,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.get(filter).await
}

#[tauri::command]
pub async fn profileCreate(
  state: State<'_, AppState>,
  data: ProfileCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.create(data).await
}

#[tauri::command]
pub async fn profileUpdate(
  state: State<'_, AppState>,
  id: String,
  data: ProfileUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.update(id, data).await
}

#[tauri::command]
pub async fn profileDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.delete(id).await
}
