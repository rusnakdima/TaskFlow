/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.getAllByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.getByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskCreate(
  state: State<'_, AppState>,
  data: SubtaskCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskUpdate(
  state: State<'_, AppState>,
  id: String,
  data: SubtaskUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskUpdateAll(
  state: State<'_, AppState>,
  data: Vec<SubtaskModel>,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.updateAll(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn subtaskDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let subtaskController = state.subtaskController.clone();
  let result = subtaskController.delete(id).await;
  result
}
