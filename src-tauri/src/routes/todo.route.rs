/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  todo_model::{TodoCreateModel, TodoUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.getAllByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.getByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetByAssignee(
  state: State<'_, AppState>,
  assigneeId: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.getByAssignee(assigneeId).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoCreate(
  state: State<'_, AppState>,
  data: TodoCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoUpdate(
  state: State<'_, AppState>,
  id: String,
  data: TodoUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.delete(id).await;
  result
}
