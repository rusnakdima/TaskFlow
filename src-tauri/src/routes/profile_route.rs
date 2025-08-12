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
pub async fn profile_get_all(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.get_all().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profile_get_by_user_id(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.get_by_user_id(userId).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profile_get(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profile_create(
  state: State<'_, AppState>,
  data: ProfileCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profile_update(
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
pub async fn profile_delete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let profileController = state.profileController.clone();
  let result = profileController.delete(id).await;
  result
}
