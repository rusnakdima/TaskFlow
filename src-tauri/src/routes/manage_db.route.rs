/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::auth_helper::{extract_user_from_token, validate_user_owns_data};
use crate::helpers::response_helper::err_response;

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
  entity_id: String,
  entity_type: String,
  source_provider: String,
  target_provider: String,
  delete_from_source: Option<bool>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  );
  let cascade_service = state.cascade_service.clone();

  if source_provider == target_provider {
    return Err(err_response("Visibility is already set to this value"));
  }

  let delete_from_src = delete_from_source.unwrap_or(false);
  let table = match entity_type.as_str() {
    "todo" | "todos" => "todos",
    "category" | "categories" => "categories",
    _ => {
      return Err(err_response(&format!(
        "Unknown entity type: {}",
        entity_type
      )))
    }
  };

  if source_provider == "Json" && target_provider == "Mongo" {
    if delete_from_src {
      cascade_service
        .sync_entity_to_mongo_and_delete_from_source(table, &entity_id)
        .await?;
    } else {
      cascade_service
        .sync_entity_to_mongo(table, &entity_id)
        .await?;
    }
  } else if source_provider == "Mongo" && target_provider == "Json" {
    if delete_from_src {
      cascade_service
        .sync_entity_to_json_and_delete_from_source(table, &entity_id)
        .await?;
    } else {
      cascade_service
        .sync_entity_to_json(table, &entity_id)
        .await?;
    }
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
