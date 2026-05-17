use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::validate_admin_role;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_all_admin_data(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state.manage_db_service.get_all_data_for_admin().await
}

#[tauri::command]
pub async fn get_all_admin_paginated(
  state: State<'_, AppState>,
  token: String,
  dataType: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .get_admin_data_paginated(dataType, skip, limit)
    .await
}
