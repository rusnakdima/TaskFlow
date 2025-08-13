/* sys lib */
use tauri::State;

/* models */
use crate::{models::response::ResponseModel, AppState};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn downloadUpdate(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  url: String,
  file_name: String,
) -> Result<ResponseModel, ResponseModel> {
  let aboutController = state.aboutController.clone();
  let result = aboutController
    .downloadUpdate(app_handle, url, file_name)
    .await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn getBinaryNameFile(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  let aboutController = state.aboutController.clone();
  let result = aboutController.getBinaryNameFile().await;
  result
}
