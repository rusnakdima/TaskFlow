/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{category_model::CategoryModel, response::ResponseModel},
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn category_get_all(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.get_all().await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn category_get(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.get(id).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn category_create(
  state: State<'_, AppState>,
  data: CategoryModel,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn category_update(
  state: State<'_, AppState>,
  id: String,
  data: CategoryModel,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.update(id, data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn category_delete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.delete(id).await;
  result
}
