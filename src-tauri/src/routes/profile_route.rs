/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{
    profile_model::{ProfileCreateModel, ProfileModel},
    response::ResponseModel,
  },
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetAll(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.getAll().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.getByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGet(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileCreate(
  state: State<'_, AppState>,
  data: ProfileCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileUpdate(
  state: State<'_, AppState>,
  id: String,
  data: ProfileModel,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.delete(id).await;
  result
}
