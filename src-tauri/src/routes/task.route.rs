/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  sync_metadata_model::SyncMetadata,
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetAllByField(
  state: State<'_, AppState>,
  filter: Value,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state
    .taskController
    .getAllByField(filter, syncMetadata)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetByField(
  state: State<'_, AppState>,
  filter: Value,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.getByField(filter, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskCreate(
  state: State<'_, AppState>,
  data: TaskCreateModel,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.create(data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskUpdate(
  state: State<'_, AppState>,
  id: String,
  data: TaskUpdateModel,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.update(id, data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskUpdateAll(
  state: State<'_, AppState>,
  data: Vec<TaskModel>,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.updateAll(data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskDelete(
  state: State<'_, AppState>,
  id: String,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.delete(id, syncMetadata).await
}
