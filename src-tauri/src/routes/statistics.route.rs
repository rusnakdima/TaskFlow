/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::entities::sync_metadata_entity::SyncMetadata;

#[tauri::command]
pub async fn statisticsGet(
  state: State<'_, AppState>,
  userId: String,
  timeRange: String,
) -> Result<serde_json::Value, serde_json::Value> {
  let syncMetadata = SyncMetadata {
    is_owner: true,
    is_private: true,
  };

  match state
    .statisticsService
    .getStatistics(userId, timeRange, syncMetadata)
    .await
  {
    Ok(response) => serde_json::to_value(response)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
    Err(e) => serde_json::to_value(e)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
  }
}
