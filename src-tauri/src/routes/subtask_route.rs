/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{
    response::ResponseModel,
    subtask_model::{SubtaskCreateModel, SubtaskModel},
  },
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtask_get_all(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.get_all().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtask_get(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtask_create(
  state: State<'_, AppState>,
  data: SubtaskCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtask_update(
  state: State<'_, AppState>,
  id: String,
  data: SubtaskModel,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtask_delete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.delete(id).await;
  result
}
