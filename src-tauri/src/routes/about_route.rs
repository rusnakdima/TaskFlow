/* sys lib */
use tauri::State;

/* models */
use crate::{models::response::ResponseModel, AppState};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn download_update(
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  url: String,
  file_name: String,
) -> Result<ResponseModel, ResponseModel> {
  let aboutController = state.aboutController.clone();
  let result = aboutController
    .download_update(app_handle, url, file_name)
    .await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn get_binary_name_file(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  let aboutController = state.aboutController.clone();
  let result = aboutController.get_binary_name_file().await;
  result
}
