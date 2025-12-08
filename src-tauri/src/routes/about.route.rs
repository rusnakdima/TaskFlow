/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn downloadUpdate(
  window: tauri::Window,
  state: State<'_, AppState>,
  appHandle: tauri::AppHandle,
  url: String,
  fileName: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .aboutController
    .downloadUpdate(&window, appHandle, url, fileName)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn getBinaryNameFile(
  state: State<'_, AppState>,
  version: String,
) -> Result<ResponseModel, ResponseModel> {
  state.aboutController.getBinaryNameFile(version).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn openFile(
  state: State<'_, AppState>,
  path: String,
) -> Result<ResponseModel, ResponseModel> {
  state.aboutController.openFile(path).await
}
