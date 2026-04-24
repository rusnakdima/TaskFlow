/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::entities::relation_obj::RelationObj;
use crate::entities::response_entity::ResponseModel;
use crate::entities::sync_metadata_entity::SyncMetadata;

/* helpers */
use crate::helpers::response_helper::err_response;

// ==================== GENERIC CRUD ENDPOINT ====================

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn manage_data(
  state: State<'_, AppState>,
  operation: String,
  table: String,
  id: Option<String>,
  data: Option<Value>,
  filter: Option<Value>,
  relations: Option<Vec<RelationObj>>,
  load: Option<Vec<String>>,
  sync_metadata: Option<SyncMetadata>,
  // Accept is_owner and is_private directly as fallback
  is_owner: Option<bool>,
  is_private: Option<bool>,
) -> Result<ResponseModel, ResponseModel> {
  // Construct sync_metadata from individual fields if not provided as object
  let final_sync_metadata = if let Some(sm) = sync_metadata {
    Some(sm)
  } else if is_owner.is_some() || is_private.is_some() {
    Some(SyncMetadata {
      is_owner: is_owner.unwrap_or(true),
      is_private: is_private.unwrap_or(true),
    })
  } else {
    None
  };

  state
    .repository_service
    .execute(
      operation,
      table,
      id,
      data,
      filter,
      relations,
      load,
      final_sync_metadata,
    )
    .await
}

// ==================== SYNC OPERATIONS ====================

#[tauri::command]
pub async fn import_to_local(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.manage_db_service.import_to_local(user_id).await
}

#[tauri::command]
pub async fn export_to_cloud(
  state: State<'_, AppState>,
  user_id: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let uid = user_id.ok_or_else(|| err_response("Missing required parameter: user_id"))?;
  state.manage_db_service.export_to_cloud(uid).await
}

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

/// Get all data from local JSON for Archive page (all users, includes deleted)
#[tauri::command]
pub async fn get_all_data_for_archive(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.manage_db_service.get_all_data_for_archive().await
}

/// Get all data for admin from MongoDB (global view with all users' data)
#[tauri::command]
pub async fn get_all_data_for_admin(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.manage_db_service.get_all_data_for_admin().await
}

#[tauri::command]
pub async fn permanently_delete_record(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .permanently_delete_record(table, id)
    .await
}

#[tauri::command]
pub async fn toggle_delete_status(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .toggle_delete_status(table, id)
    .await
}

#[tauri::command]
pub async fn toggle_delete_status_local(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .toggle_delete_status_local(table, id)
    .await
}

#[tauri::command]
pub async fn permanently_delete_record_local(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .permanently_delete_record_local(table, id)
    .await
}

#[tauri::command]
pub async fn sync_visibility_to_provider(
  state: State<'_, AppState>,
  todo_id: String,
  source_provider: String,
  target_provider: String,
) -> Result<ResponseModel, ResponseModel> {
  use crate::entities::provider_type_entity::ProviderType;

  let source = if source_provider == "Mongo" {
    ProviderType::Mongo
  } else {
    ProviderType::Json
  };
  let target = if target_provider == "Mongo" {
    ProviderType::Mongo
  } else {
    ProviderType::Json
  };

  state
    .repository_service
    .handle_sync_visibility_to_provider(todo_id, source, target)
    .await
}
