/* sys lib */
use crate::AppState;
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
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .profileController
    .getAllByField(nameField, value)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  state.profileController.getByField(nameField, value).await
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
