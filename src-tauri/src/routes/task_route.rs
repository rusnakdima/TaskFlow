/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{
    response::ResponseModel,
    task_model::{TaskCreateModel, TaskModel},
  },
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetAll(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.getAll().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.getByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGet(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskCreate(
  state: State<'_, AppState>,
  data: TaskCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskUpdate(
  state: State<'_, AppState>,
  id: String,
  data: TaskModel,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.delete(id).await;
  result
}
