/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::models::{
  category_model::{CategoryCreateModel, CategoryModel},
  response_model::ResponseModel,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryGetAll(
  state: State<'_, AppState>,
  filter: Value,
) -> Result<ResponseModel, ResponseModel> {
  state.categoriesController.getAll(filter).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryGet(
  state: State<'_, AppState>,
  filter: Value,
) -> Result<ResponseModel, ResponseModel> {
  state.categoriesController.get(filter).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryCreate(
  state: State<'_, AppState>,
  data: CategoryCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  state.categoriesController.create(data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryUpdate(
  state: State<'_, AppState>,
  id: String,
  data: CategoryModel,
) -> Result<ResponseModel, ResponseModel> {
  state.categoriesController.update(id, data).await
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.categoriesController.delete(id).await
}
