use crate::entities::response_entity::{ResponseModel, ResponseStatus};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::{err_response_formatted, success_response};
use crate::services::cascade::CascadeResult;
use crate::AppState;
use tauri::State;

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

    let _offline = use_json;
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
