/* sys lib */
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn statistics_get(
  state: State<'_, AppState>,
  user_id: String,
  time_range: String,
) -> Result<serde_json::Value, serde_json::Value> {
  match state
    .statistics_service
    .get_statistics(user_id, time_range, "private".to_string())
    .await
  {
    Ok(response) => serde_json::to_value(response)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
    Err(e) => serde_json::to_value(e)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
  }
}
