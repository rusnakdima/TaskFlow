use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::err_response_formatted;
use crate::services::cascade::CascadeResult;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn batch_soft_delete_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
) -> Result<Vec<CascadeResult>, ResponseModel> {
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  for id in &ids {
    match state
      .cascade_service
      .soft_delete_cascade_json(&table, id)
      .await
    {
      Ok(result) => {
        all_failed = false;
        results.push(result);
      }
      Err(e) => {
        tracing::warn!(
          "batch_soft_delete_cascade failed for id {}: {}",
          id,
          e.message
        );
      }
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch soft delete operations failed",
      "",
    ));
  }

  Ok(results)
}

#[tauri::command]
pub async fn batch_hard_delete_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
) -> Result<Vec<CascadeResult>, ResponseModel> {
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  for id in &ids {
    match state
      .cascade_service
      .permanent_delete_cascade_json(&table, id)
      .await
    {
      Ok(result) => {
        all_failed = false;
        results.push(result);
      }
      Err(e) => {
        tracing::warn!(
          "batch_hard_delete_cascade failed for id {}: {}",
          id,
          e.message
        );
      }
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch hard delete operations failed",
      "",
    ));
  }

  Ok(results)
}

#[tauri::command]
pub async fn batch_restore_cascade(
  state: State<'_, AppState>,
  table: String,
  ids: Vec<String>,
) -> Result<Vec<CascadeResult>, ResponseModel> {
  let mut results: Vec<CascadeResult> = Vec::new();
  let mut all_failed = true;

  for id in &ids {
    match state.cascade_service.restore_cascade_json(&table, id).await {
      Ok(result) => {
        all_failed = false;
        results.push(result);
      }
      Err(e) => {
        tracing::warn!("batch_restore_cascade failed for id {}: {}", id, e.message);
      }
    }
  }

  if results.is_empty() || all_failed {
    return Err(err_response_formatted(
      "All batch restore operations failed",
      "",
    ));
  }

  Ok(results)
}
