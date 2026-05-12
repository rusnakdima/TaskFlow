use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::validate_admin_role;
use crate::AppState;
use tauri::State;

const ALLOWED_TABLES: [&str; 8] = [
  "todos",
  "tasks",
  "subtasks",
  "categories",
  "profiles",
  "chats",
  "comments",
  "users",
];

fn validate_table_name(table: &str) -> Result<(), ResponseModel> {
  if ALLOWED_TABLES.contains(&table) {
    Ok(())
  } else {
    Err(ResponseModel::new_false("Invalid table name"))
  }
}

#[tauri::command]
pub async fn admin_get_all(
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
pub async fn admin_get_paginated(
  state: State<'_, AppState>,
  token: String,
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .get_admin_data_paginated(data_type, skip, limit)
    .await
}

#[tauri::command]
pub async fn admin_toggle_delete(
  state: State<'_, AppState>,
  token: String,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_table_name(&table)?;
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .toggle_delete_status(table, id)
    .await
}

#[tauri::command]
pub async fn admin_permanently_delete(
  state: State<'_, AppState>,
  token: String,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_table_name(&table)?;
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .permanently_delete_record(table, id)
    .await
}

#[tauri::command]
pub async fn admin_toggle_delete_local(
  state: State<'_, AppState>,
  token: String,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_table_name(&table)?;
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .toggle_delete_status_local(table, id)
    .await
}

#[tauri::command]
pub async fn admin_permanently_delete_local(
  state: State<'_, AppState>,
  token: String,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_table_name(&table)?;
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .permanently_delete_record_local(table, id)
    .await
}

#[tauri::command]
pub async fn admin_get_all_archive(
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
  state.manage_db_service.get_all_data_for_archive().await
}

#[tauri::command]
pub async fn admin_get_archive_paginated(
  state: State<'_, AppState>,
  token: String,
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  validate_admin_role(
    &token,
    &state.config_helper.jwt_secret,
    &state.manage_db_service.json_provider,
    state.manage_db_service.get_mongodb_provider().as_ref(),
  )
  .await?;
  state
    .manage_db_service
    .get_archive_data_paginated(data_type, skip, limit)
    .await
}
