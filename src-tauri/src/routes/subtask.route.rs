/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
  sync_metadata_model::SyncMetadata,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state
    .subtaskController
    .getAllByField(nameField, value, syncMetadata)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state
    .subtaskController
    .getByField(nameField, value, syncMetadata)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskCreate(
  state: State<'_, AppState>,
  data: SubtaskCreateModel,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.subtaskController.create(data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskUpdate(
  state: State<'_, AppState>,
  id: String,
  data: SubtaskUpdateModel,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.subtaskController.update(id, data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskUpdateAll(
  state: State<'_, AppState>,
  data: Vec<SubtaskModel>,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.subtaskController.updateAll(data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskDelete(
  state: State<'_, AppState>,
  id: String,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.subtaskController.delete(id, syncMetadata).await
}
