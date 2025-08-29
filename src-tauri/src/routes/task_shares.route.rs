/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{
    response::ResponseModel,
    task_shares_model::{TaskSharesCreateModel, TaskSharesModel},
  },
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskSharesGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.getAllByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskSharesGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.getByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskSharesCreate(
  state: State<'_, AppState>,
  data: TaskSharesCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskSharesUpdate(
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
pub async fn taskSharesDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskSharesController = state.taskSharesController.clone();
  let result = taskSharesController.delete(id).await;
  result
}
