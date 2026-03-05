/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

#[tauri::command]
pub async fn downloadUpdate(
  window: tauri::Window,
  state: State<'_, AppState>,
  appHandle: tauri::AppHandle,
  url: String,
  fileName: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .aboutService
    .downloadFile(&window, appHandle, url, fileName)
    .await
}

#[tauri::command]
pub async fn getBinaryNameFile(
  state: State<'_, AppState>,
  version: String,
) -> Result<ResponseModel, ResponseModel> {
  state.aboutService.getBinaryNameFile(version).await
}

#[tauri::command]
pub async fn openFile(
  state: State<'_, AppState>,
  path: String,
) -> Result<ResponseModel, ResponseModel> {
  state.aboutService.openFile(path).await
}
