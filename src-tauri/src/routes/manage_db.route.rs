/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::auth_helper::validate_user_owns_data;
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
  load: Option<String>,
  visibility: Option<String>,
  offline: Option<bool>,
) -> Result<ResponseModel, ResponseModel> {
  let is_offline = offline.unwrap_or(false);

  if is_offline {
    let read_operations = ["getAll", "get"];
    if read_operations.contains(&operation.as_str()) {
      // Read operations are allowed offline for all visibility levels
    } else {
      // Check visibility - either from parameter or from data object
      let mut effective_visibility = visibility.as_deref();
      if effective_visibility.is_none() {
        if let Some(ref d) = data {
          effective_visibility = d.get("visibility").and_then(|v| v.as_str());
        }
      }

      if effective_visibility == Some("private") {
        // Write operations are allowed offline ONLY for private data (stored in JSON)
        // Private todos, tasks, subtasks are stored locally and don't need MongoDB
      } else {
        // Shared and public data requires MongoDB connection for write operations
        return Err(err_response(
          "Operation not available while offline. Please connect to the internet and try again.",
        ));
      }
    }
  }

  let result = state
    .repository_service
    .execute(
      operation,
      table.clone(),
      id,
      data,
      filter,
      load,
      visibility,
      is_offline,
    )
    .await;
  result
}

// ==================== SYNC OPERATIONS ====================

#[tauri::command]
pub async fn import_to_local(
  state: State<'_, AppState>,
  user_id: String,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_user_owns_data(&token, &state.config_helper.jwt_secret, &user_id)?;
  state.manage_db_service.import_to_local(user_id).await
}

#[tauri::command]
pub async fn export_to_cloud(
  state: State<'_, AppState>,
  user_id: String,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  if user_id.is_empty() {
    return Err(err_response("Missing required parameter: user_id"));
  };
  validate_user_owns_data(&token, &state.config_helper.jwt_secret, &user_id)?;
  state.manage_db_service.export_to_cloud(user_id).await
}

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

/// Check if MongoDB is connected
#[tauri::command]
pub async fn check_mongodb_connection(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  let is_connected = state
    .manage_db_service
    .check_mongodb_connection_async()
    .await;
  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: if is_connected {
      "MongoDB is connected".to_string()
    } else {
      "MongoDB is not connected".to_string()
    },
    data: DataValue::Bool(is_connected),
  })
}

/// Reconnect to MongoDB
#[tauri::command]
pub async fn reconnect_mongodb(state: State<'_, AppState>) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .reconnect_mongodb(
      state.cascade_service.clone(),
      state.entity_resolution.clone(),
    )
    .await
    .map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: e,
      data: DataValue::Bool(false),
    })?;

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "MongoDB reconnected successfully".to_string(),
    data: DataValue::Bool(true),
  })
}

/// Get all data from local JSON for Archive page (all users, includes deleted)
#[tauri::command]
pub async fn get_all_data_for_archive(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.manage_db_service.get_all_data_for_archive().await
}

/// Get paginated data from local JSON for Archive page
#[tauri::command]
pub async fn get_archive_data_paginated(
  state: State<'_, AppState>,
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .get_archive_data_paginated(data_type, skip, limit)
    .await
}

/// Get all data for admin from MongoDB (global view with all users' data)
#[tauri::command]
pub async fn get_all_data_for_admin(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.manage_db_service.get_all_data_for_admin().await
}

/// Get paginated data from MongoDB for Admin page
#[tauri::command]
pub async fn get_admin_data_paginated(
  state: State<'_, AppState>,
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .get_admin_data_paginated(data_type, skip, limit)
    .await
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
  use crate::services::cascade::VisibilitySyncService;

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

  VisibilitySyncService::sync_todo_visibility(
    &state.repository_service.json_provider,
    state.repository_service.mongodb_provider.as_ref(),
    todo_id,
    source,
    target,
  )
  .await
}

#[tauri::command]
pub async fn get_tasks_by_month(
  state: State<'_, AppState>,
  year: i32,
  month: i32,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manage_db_service
    .get_tasks_by_month(year, month)
    .await
}
