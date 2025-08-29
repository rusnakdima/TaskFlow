/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn importToJsonDb(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let managedbController = state.managedbController.clone();
  let result = managedbController.importToJsonDb().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn exportFromJsonDb(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let managedbController = state.managedbController.clone();
  let result = managedbController.exportFromJsonDb().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn importToMongoDb(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let managedbController = state.managedbController.clone();
  let result = managedbController.importToMongoDb().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn exportFromMongoDb(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let managedbController = state.managedbController.clone();
  let result = managedbController.exportFromMongoDb().await;
  result
}
