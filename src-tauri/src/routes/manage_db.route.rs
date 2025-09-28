/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn importToLocal(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  let managedbController = state.managedbController.clone();
  let result = managedbController.importToLocal(userId).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn exportToCloud(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  let managedbController = state.managedbController.clone();
  let result = managedbController.exportToCloud(userId).await;
  result
}
