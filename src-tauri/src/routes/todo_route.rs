/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{
    response::ResponseModel,
    todo_model::{TodoCreateModel, TodoModel},
  },
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetAll(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.getAll().await;
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
pub async fn todoGet(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.get(id).await;
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
  data: TodoModel,
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
