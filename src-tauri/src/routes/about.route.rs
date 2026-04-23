/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::entities::response_entity::ResponseModel;

#[tauri::command]
pub async fn download_update(
  window: tauri::Window,
  state: State<'_, AppState>,
  app_handle: tauri::AppHandle,
  url: String,
  file_name: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .about_service
    .download_file(&window, app_handle, url, file_name)
    .await
}

#[tauri::command]
pub async fn get_binary_name_file(
  state: State<'_, AppState>,
  version: String,
) -> Result<ResponseModel, ResponseModel> {
  state.about_service.get_binary_name_file(version).await
}

#[tauri::command]
pub async fn open_file(
  state: State<'_, AppState>,
  path: String,
) -> Result<ResponseModel, ResponseModel> {
  state.about_service.open_file(path).await
}
