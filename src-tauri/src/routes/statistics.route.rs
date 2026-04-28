/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::entities::sync_metadata_entity::SyncMetadata;

// TODO [API v2]: statistics_get returns `Result<serde_json::Value, serde_json::Value>` instead of `Result<ResponseModel, ResponseModel>`.
// This is inconsistent with other endpoints. Should return ResponseModel for consistency.

#[tauri::command]
pub async fn statistics_get(
  state: State<'_, AppState>,
  user_id: String,
  time_range: String,
) -> Result<serde_json::Value, serde_json::Value> {
  let sync_metadata = SyncMetadata {
    is_owner: true,
    is_private: true,
    visibility: None,
  };

  match state
    .statistics_service
    .get_statistics(user_id, time_range, sync_metadata)
    .await
  {
    Ok(response) => serde_json::to_value(response)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
    Err(e) => serde_json::to_value(e)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
  }
}
