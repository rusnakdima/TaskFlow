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
  state.managedbController.importToLocal(userId).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn exportToCloud(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  state.managedbController.exportToCloud(userId).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn getAllDataForAdmin(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.managedbController.getAllDataForAdmin().await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn permanentlyDeleteRecord(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .managedbController
    .permanentlyDeleteRecord(table, id)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn toggleDeleteStatus(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.managedbController.toggleDeleteStatus(table, id).await
}
