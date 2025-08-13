/* sys lib */
use tauri::State;

/* models */
use crate::{
  models::{
    category_model::{CategoryCreateModel, CategoryModel},
    response::ResponseModel,
  },
  AppState,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.getAllByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.getByField(nameField, value).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryCreate(
  state: State<'_, AppState>,
  data: CategoryCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.create(data).await;
  result
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn categoryUpdate(
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
pub async fn categoryDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  let categoriesController = state.categoriesController.clone();
  let result = categoriesController.delete(id).await;
  result
}
