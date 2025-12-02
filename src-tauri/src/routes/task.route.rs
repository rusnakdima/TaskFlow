/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.getAllByField(nameField, value).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.getByField(nameField, value).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskCreate(
  state: State<'_, AppState>,
  data: TaskCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.create(data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskUpdate(
  state: State<'_, AppState>,
  id: String,
  data: TaskUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.update(id, data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskUpdateAll(
  state: State<'_, AppState>,
  data: Vec<TaskModel>,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.updateAll(data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn taskDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.taskController.delete(id).await
}
