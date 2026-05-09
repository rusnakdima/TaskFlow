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
  mut data: Option<Value>,
  filter: Option<Value>,
  load: Option<String>,
  visibility: Option<String>,
  offline: Option<bool>,
  request_id: Option<String>,
  items: Option<Value>,
) -> Result<ResponseModel, ResponseModel> {
  let is_offline = offline.unwrap_or(false);
  let req_id = request_id.unwrap_or_else(|| "no-req-id".to_string());
  let start = std::time::Instant::now();

  // If updateAll with items but no data, use items as data
  if operation == "updateAll" && data.is_none() && items.is_some() {
    data = items;
  }

  tracing::debug!(
    "[Route] >>> manage_data request_id={} op={} table={} offline={}",
    req_id,
    operation,
    table,
    is_offline
  );

  if is_offline {
    let read_operations = ["getAll", "get"];
    if !read_operations.contains(&operation.as_str()) {
      let effective_visibility = visibility.as_deref().unwrap_or("private");

      let is_status_only_update = operation == "update"
        && data.as_ref().is_some_and(|d| {
          if let Some(obj) = d.as_object() {
            obj.len() == 1 && obj.contains_key("status")
          } else {
            false
          }
        });

      if effective_visibility != "private" && !is_status_only_update {
        return Err(err_response(
          "Operation not available while offline. Please connect to the internet and try again.",
        ));
      }
    }
  }

  let op_for_log = operation.clone();
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

  let elapsed = start.elapsed();
  match &result {
    Ok(_) => tracing::debug!("[Route] <<< manage_data COMPLETE request_id={} op={} table={} elapsed={:?} status=success", req_id, op_for_log, table, elapsed),
    Err(e) => tracing::debug!("[Route] <<< manage_data COMPLETE request_id={} op={} table={} elapsed={:?} status=error message={}", req_id, op_for_log, table, elapsed, e.message),
  }

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
  offline: Option<bool>,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let is_offline = offline.unwrap_or(false);
  let effective_visibility = visibility.as_deref().unwrap_or("private");

  if is_offline && effective_visibility != "private" {
    return Err(err_response(
      "Operation not available while offline. Please connect to the internet and try again.",
    ));
  }

  state
    .manage_db_service
    .get_tasks_by_month(year, month, is_offline, effective_visibility)
    .await
}
