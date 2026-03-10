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
  // Check if filter is a userId object { userId: "..." } or a profile id string
  if let Some(obj) = filter.as_object() {
    if let Some(userId) = obj.get("userId").and_then(|v| v.as_str()) {
      // Get profile by userId
      return state.profileService.getByUserId(userId.to_string()).await;
    }
  }

  // Otherwise treat as profile id
  let id = filter.as_str().unwrap_or_default().to_string();
  state.profileService.get(id).await
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
  _id: String,
  data: ProfileUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.update(data).await
}

#[tauri::command]
pub async fn profileDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.delete(id).await
}
