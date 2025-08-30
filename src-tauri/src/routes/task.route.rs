/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  task_model::{TaskCreateModel, TaskUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let taskController = state.taskController.clone();
  let result = taskController.getAllByField(nameField, value).await;
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
  data: TaskUpdateModel,
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
