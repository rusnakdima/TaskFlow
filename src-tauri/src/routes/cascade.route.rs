use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response_formatted;
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
) -> Result<CascadeResult, ResponseModel> {
  let _user_id = extract_user_from_token(&token, &state.config_helper.jwt_secret).map_err(|e| e)?;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  if use_json {
    state
      .cascade_service
      .soft_delete_cascade_json(&table, &id)
      .await
  } else {
    state
      .cascade_service
      .soft_delete_cascade_mongo(&table, &id)
      .await
  }
}

#[tauri::command]
pub async fn hard_remove_data(
  state: State<'_, AppState>,
  table: String,
  id: String,
  token: String,
  visibility: Option<String>,
) -> Result<CascadeResult, ResponseModel> {
  let _user_id = extract_user_from_token(&token, &state.config_helper.jwt_secret).map_err(|e| e)?;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  if use_json {
    state
      .cascade_service
      .permanent_delete_cascade_json(&table, &id)
      .await
  } else {
    state
      .cascade_service
      .permanent_delete_cascade_mongo(&table, &id)
      .await
  }
}

#[tauri::command]
pub async fn batch_soft_delete_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
  token: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(&token, &state.config_helper.jwt_secret).map_err(|e| e)?;
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  for id in &ids {
    let result = if use_json {
      state
        .cascade_service
        .soft_delete_cascade_json(&table, id)
        .await
    } else {
      state
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
    data: DataValue::Array(
      results
        .into_iter()
        .map(|r| serde_json::to_value(r).unwrap_or_default())
        .collect(),
    ),
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
  let _user_id = extract_user_from_token(&token, &state.config_helper.jwt_secret).map_err(|e| e)?;
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  for id in &ids {
    let result = if use_json {
      state
        .cascade_service
        .permanent_delete_cascade_json(&table, id)
        .await
    } else {
      state
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
    data: DataValue::Array(
      results
        .into_iter()
        .map(|r| serde_json::to_value(r).unwrap_or_default())
        .collect(),
    ),
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
  let _user_id = extract_user_from_token(&token, &state.config_helper.jwt_secret).map_err(|e| e)?;
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  let use_json = visibility.as_deref() == Some("private") || visibility.is_none();

  for id in &ids {
    let result = if use_json {
      state.cascade_service.restore_cascade_json(&table, id).await
    } else {
      state
        .cascade_service
        .restore_cascade_mongo(&table, id)
        .await
    };

    if let Ok(result) = result {
      all_failed = false;
      results.push(result);
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch restore operations failed",
      "",
    ));
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: format!("{} records restored", results.len()),
    data: DataValue::Array(
      results
        .into_iter()
        .map(|r| serde_json::to_value(r).unwrap_or_default())
        .collect(),
    ),
  })
}
