/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{response::ResponseModel, task_shares_model::TaskSharesModel},
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_shares_get_all(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.get_all().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_shares_get(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_shares_create(
  state: State<'_, AppState>,
  data: TaskSharesModel,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_shares_update(
  state: State<'_, AppState>,
  id: String,
  data: TaskSharesModel,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_shares_delete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.delete(id).await;
  result
}
