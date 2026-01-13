/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  sync_metadata_model::SyncMetadata,
  todo_model::{TodoCreateModel, TodoModel, TodoUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetAllByField(
  state: State<'_, AppState>,
  filter: Value,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state
    .todoController
    .getAllByField(filter, syncMetadata)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetByField(
  state: State<'_, AppState>,
  filter: Value,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.getByField(filter, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetByAssignee(
  state: State<'_, AppState>,
  assigneeId: String,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state
    .todoController
    .getByAssignee(assigneeId, syncMetadata)
    .await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoCreate(
  state: State<'_, AppState>,
  data: TodoCreateModel,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.create(data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoUpdate(
  state: State<'_, AppState>,
  id: String,
  data: TodoUpdateModel,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.update(id, data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoUpdateAll(
  state: State<'_, AppState>,
  data: Vec<TodoModel>,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.updateAll(data, syncMetadata).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoDelete(
  state: State<'_, AppState>,
  id: String,
  syncMetadata: SyncMetadata,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.delete(id, syncMetadata).await
}
