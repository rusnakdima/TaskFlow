/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileUpdateModel},
  response_model::ResponseModel,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetAllByField(
  state: State<'_, AppState>,
  filter: Value,
) -> Result<ResponseModel, ResponseModel> {
  state.profileController.getAllByField(filter).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetByField(
  state: State<'_, AppState>,
  filter: Value,
) -> Result<ResponseModel, ResponseModel> {
  state.profileController.getByField(filter).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileCreate(
  state: State<'_, AppState>,
  data: ProfileCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.profileController.create(data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileUpdate(
  state: State<'_, AppState>,
  id: String,
  data: ProfileUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.profileController.update(id, data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.profileController.delete(id).await
}
