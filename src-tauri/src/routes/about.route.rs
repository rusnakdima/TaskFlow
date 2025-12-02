/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn downloadUpdate(
  state: State<'_, AppState>,
  appHandle: tauri::AppHandle,
  url: String,
  fileName: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .aboutController
    .downloadUpdate(appHandle, url, fileName)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn getBinaryNameFile(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  state.aboutController.getBinaryNameFile().await
}
