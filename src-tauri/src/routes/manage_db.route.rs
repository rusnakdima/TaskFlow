/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::auth_helper::{extract_user_from_token, validate_user_owns_data};
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
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let is_offline = offline.unwrap_or(false);
  let _req_id = request_id.unwrap_or_else(|| "no-req-id".to_string());
  let start = std::time::Instant::now();

  // If updateAll with items but no data, use items as data
  if operation == "updateAll" && data.is_none() && items.is_some() {
    data = items;
  }

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

  let _op_for_log = operation.clone();
  let user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .ok();
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
      user_id,
      None,
      None,
    )
    .await;

  let _elapsed = start.elapsed();
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

#[tauri::command(rename_all = "snake_case")]
pub async fn sync_visibility_to_provider(
  state: State<'_, AppState>,
  todo_id: String,
  source_provider: String,
  target_provider: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  );
  let cascade_service = state.cascade_service.clone();

  if source_provider == "Mongo" && target_provider == "Json" {
    cascade_service
      .sync_entity_to_json("todos", &todo_id)
      .await?;
  } else if source_provider == "Json" && target_provider == "Mongo" {
    cascade_service
      .sync_entity_to_mongo("todos", &todo_id)
      .await?;
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Visibility synced".to_string(),
    data: DataValue::String("".to_string()),
  })
}

// ==================== CALENDAR ENDPOINTS ====================

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
