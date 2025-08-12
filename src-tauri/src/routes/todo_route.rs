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
pub async fn todo_get_all(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.get_all().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todo_get(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todo_create(
  state: State<'_, AppState>,
  data: TodoCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todo_update(
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
pub async fn todo_delete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let todoController = state.todoController.clone();
  let result = todoController.delete(id).await;
  result
}
