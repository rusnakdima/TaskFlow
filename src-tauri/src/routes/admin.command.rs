use crate::entities::response_entity::{ResponseModel, ResponseStatus};
use crate::helpers::auth::{extract_user_from_token, validate_admin_role, validate_user_owns_data};
use crate::helpers::response_helper::{err_response, err_response_formatted, success_response};
use crate::services::cascade::CascadeResult;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_all_admin_data(
  state: State<'_, AppState>,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_admin_role(
    &token,
    &state.config.config_helper.jwt_secret,
    &state.system.manage_db_service.json_provider,
    state
      .system
      .manage_db_service
      .get_mongodb_provider()
      .as_ref(),
  )
  .await?;
  state
    .system
    .manage_db_service
    .get_all_data_for_admin()
    .await
}

#[tauri::command]
pub async fn get_all_admin_paginated(
  state: State<'_, AppState>,
  token: String,
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  validate_admin_role(
    &token,
    &state.config.config_helper.jwt_secret,
    &state.config.json_provider,
    state
      .system
      .manage_db_service
      .get_mongodb_provider()
      .as_ref(),
  )
  .await?;
  state
    .system
    .manage_db_service
    .get_admin_data_paginated(data_type, skip, limit)
    .await
}

#[tauri::command]
pub async fn soft_remove_data(
  state: State<'_, AppState>,
  table: String,
  id: String,
  token: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id =
    extract_user_from_token(&token, &state.config.config_helper.jwt_secret).map_err(|e| e)?;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  let result = if use_json {
    state
      .data
      .cascade_service
      .soft_delete_cascade_json(&table, &id)
      .await?
  } else {
    state
      .data
      .cascade_service
      .soft_delete_cascade_mongo(&table, &id)
      .await?
  };

  Ok(success_response(result))
}

#[tauri::command]
pub async fn hard_remove_data(
  state: State<'_, AppState>,
  table: String,
  id: String,
  token: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id =
    extract_user_from_token(&token, &state.config.config_helper.jwt_secret).map_err(|e| e)?;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  let result = if use_json {
    state
      .data
      .cascade_service
      .permanent_delete_cascade_json(&table, &id)
      .await?
  } else {
    state
      .data
      .cascade_service
      .permanent_delete_cascade_mongo(&table, &id)
      .await?
  };

  Ok(success_response(result))
}

#[tauri::command]
pub async fn batch_soft_delete_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
  token: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id =
    extract_user_from_token(&token, &state.config.config_helper.jwt_secret).map_err(|e| e)?;
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  for id in &ids {
    let result = if use_json {
      state
        .data
        .cascade_service
        .soft_delete_cascade_json(&table, id)
        .await
    } else {
      state
        .data
        .cascade_service
        .soft_delete_cascade_mongo(&table, id)
        .await
    };

    if let Ok(result) = result {
      all_failed = false;
      results.push(result);
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch soft delete operations failed",
      "",
    ));
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: format!("{} records processed", results.len()),
    data: serde_json::json!(results
      .into_iter()
      .map(|r| serde_json::to_value(r).unwrap_or_default())
      .collect::<Vec<_>>()),
  })
}

#[tauri::command]
pub async fn batch_hard_delete_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
  token: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id =
    extract_user_from_token(&token, &state.config.config_helper.jwt_secret).map_err(|e| e)?;
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  for id in &ids {
    let result = if use_json {
      state
        .data
        .cascade_service
        .permanent_delete_cascade_json(&table, id)
        .await
    } else {
      state
        .data
        .cascade_service
        .permanent_delete_cascade_mongo(&table, id)
        .await
    };

    if let Ok(result) = result {
      all_failed = false;
      results.push(result);
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch hard delete operations failed",
      "",
    ));
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: format!("{} records processed", results.len()),
    data: serde_json::json!(results
      .into_iter()
      .map(|r| serde_json::to_value(r).unwrap_or_default())
      .collect::<Vec<_>>()),
  })
}

#[tauri::command]
pub async fn batch_restore_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
  token: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id =
    extract_user_from_token(&token, &state.config.config_helper.jwt_secret).map_err(|e| e)?;
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;
  let mut all_affected_todo_ids: Vec<String> = Vec::new();

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  for id in &ids {
    let result = if use_json {
      state
        .data
        .cascade_service
        .restore_cascade_json(&table, id)
        .await
    } else {
      state
        .data
        .cascade_service
        .restore_cascade_mongo(&table, id)
        .await
    };

    if let Ok(result) = result {
      all_failed = false;
      results.push(result.clone());
      all_affected_todo_ids.extend(result.affected_todo_ids);
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch restore operations failed",
      "",
    ));
  }

  if !all_affected_todo_ids.is_empty() {
    let unique_todo_ids: Vec<String> = all_affected_todo_ids
      .into_iter()
      .collect::<std::collections::HashSet<_>>()
      .into_iter()
      .collect();

    let is_json = use_json;

    for todo_id in &unique_todo_ids {
      if use_json {
        let _ = state
          .data
          .repository_service
          .count_service
          .refresh_todo_counts(todo_id, &state.config.json_provider, is_json)
          .await;
      } else if let Some(ref mongo) = state.config.mongodb_provider {
        let _ = state
          .data
          .repository_service
          .count_service
          .refresh_todo_counts(todo_id, mongo.as_ref(), is_json)
          .await;
      }
    }
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: format!("{} records restored", results.len()),
    data: serde_json::json!(results
      .into_iter()
      .map(|r| serde_json::to_value(r).unwrap_or_default())
      .collect::<Vec<_>>()),
  })
}

#[tauri::command]
pub async fn import_to_local(
  state: State<'_, AppState>,
  user_id: String,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_user_owns_data(&token, &state.config.config_helper.jwt_secret, &user_id)?;
  state
    .system
    .manage_db_service
    .import_to_local(user_id)
    .await
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
  validate_user_owns_data(&token, &state.config.config_helper.jwt_secret, &user_id)?;
  state
    .system
    .manage_db_service
    .export_to_cloud(user_id)
    .await
}

#[tauri::command]
pub async fn check_mongodb_connection(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  let is_connected = state
    .system
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
    data: serde_json::Value::Bool(is_connected),
  })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sync_visibility_to_provider(
  state: State<'_, AppState>,
  todo_id: String,
  entity_type: String,
  source_provider: String,
  target_provider: String,
  new_visibility: Option<String>,
  delete_from_source: Option<bool>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  );
  let cascade_service = state.data.cascade_service.clone();

  if source_provider == target_provider {
    return Err(err_response("Visibility is already set to this value"));
  }

  let delete_from_src =
    delete_from_source.unwrap_or_else(|| source_provider == "Json" && target_provider == "Mongo");
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
        .sync_entity_to_json_and_delete_from_source(table, &todo_id)
        .await?;
    } else if table == "todos" {
      let visibility = new_visibility
        .as_deref()
        .unwrap_or(if target_provider == "Mongo" {
          "shared"
        } else {
          "private"
        });
      cascade_service
        .sync_todo_with_children(
          &todo_id,
          &source_provider,
          &target_provider,
          visibility,
          delete_from_src,
        )
        .await?;
    } else {
      cascade_service
        .sync_entity_to_mongo(table, &todo_id)
        .await?;
    }
  } else if source_provider == "Mongo" && target_provider == "Json" {
    if delete_from_src {
      cascade_service
        .sync_entity_to_json_and_delete_from_source(table, &todo_id)
        .await?;
    } else if table == "todos" {
      let visibility = new_visibility.as_deref().unwrap_or("private");
      cascade_service
        .sync_todo_with_children(
          &todo_id,
          &source_provider,
          &target_provider,
          visibility,
          delete_from_src,
        )
        .await?;
    } else {
      cascade_service.sync_entity_to_json(table, &todo_id).await?;
    }
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Visibility synced".to_string(),
    data: serde_json::Value::String("".to_string()),
  })
}

#[tauri::command]
pub async fn cleanup_non_private_from_json(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  let cascade_service = state.data.cascade_service.clone();
  cascade_service.cleanup_non_private_from_json().await?;

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Cleanup completed".to_string(),
    data: serde_json::Value::String("".to_string()),
  })
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
    .system
    .manage_db_service
    .get_tasks_by_month(year, month, is_offline, effective_visibility)
    .await
}

#[tauri::command]
pub async fn upsert_to_json(
  state: State<'_, AppState>,
  table: String,
  data: serde_json::Value,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .system
    .manage_db_service
    .upsert_to_json(table, data, id)
    .await
}

#[tauri::command]
pub async fn upsert_to_mongo(
  state: State<'_, AppState>,
  table: String,
  data: serde_json::Value,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .system
    .manage_db_service
    .upsert_to_mongo(table, data, id)
    .await
}

#[tauri::command]
pub async fn delete_from_json(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .system
    .manage_db_service
    .delete_from_json(table, id)
    .await
}

#[tauri::command]
pub async fn batch_soft_delete_json(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .system
    .manage_db_service
    .batch_soft_delete_json(table, ids)
    .await
}

#[tauri::command]
pub async fn batch_restore_json(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .system
    .manage_db_service
    .batch_restore_json(table, ids)
    .await
}

#[tauri::command]
pub async fn get_all_from_json(
  state: State<'_, AppState>,
  table: String,
  limit: Option<u64>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_limit = limit.unwrap_or(100);
  state
    .system
    .manage_db_service
    .get_all_from_json(table, effective_limit)
    .await
}

#[tauri::command]
pub async fn import_private_to_local(
  state: State<'_, AppState>,
  user_id: String,
  token: String,
) -> Result<ResponseModel, ResponseModel> {
  validate_user_owns_data(&token, &state.config.config_helper.jwt_secret, &user_id)?;
  state
    .system
    .manage_db_service
    .import_private_to_local(user_id)
    .await
}
