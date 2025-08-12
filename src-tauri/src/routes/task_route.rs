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
pub async fn task_get_all(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.get_all().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_get(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_create(
  state: State<'_, AppState>,
  data: TaskCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn task_update(
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
pub async fn task_delete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.delete(id).await;
  result
}
