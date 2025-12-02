/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  response_model::ResponseModel,
  todo_model::{TodoCreateModel, TodoModel, TodoUpdateModel},
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.getAllByField(nameField, value).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.getByField(nameField, value).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoGetByAssignee(
  state: State<'_, AppState>,
  assigneeId: String,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.getByAssignee(assigneeId).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoCreate(
  state: State<'_, AppState>,
  data: TodoCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.create(data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoUpdate(
  state: State<'_, AppState>,
  id: String,
  data: TodoUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.update(id, data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoUpdateAll(
  state: State<'_, AppState>,
  data: Vec<TodoModel>,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.updateAll(data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn todoDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.todoController.delete(id).await
}
