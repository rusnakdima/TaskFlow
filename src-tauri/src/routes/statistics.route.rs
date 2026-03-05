/* sys lib */
use crate::AppState;
use tauri::State;

/* services */
use crate::services::statistics_service::StatisticsService;

/* models */
use crate::models::sync_metadata_model::SyncMetadata;

#[tauri::command]
pub async fn statisticsGet(
  state: State<'_, AppState>,
  userId: String,
  timeRange: String,
) -> Result<serde_json::Value, serde_json::Value> {
  let mongodbProvider = state.crudService.mongodbProvider.clone().ok_or_else(
    || serde_json::json!({"status": "error", "message": "MongoDB provider not initialized"}),
  )?;

  let statisticsService = StatisticsService::new(
    state.crudService.jsonProvider.clone(),
    mongodbProvider,
    state.activityLogHelper.clone(),
  );

  let syncMetadata = SyncMetadata {
    isOwner: true,
    isPrivate: true,
  };

  match statisticsService
    .getStatistics(userId, timeRange, syncMetadata)
    .await
  {
    Ok(response) => serde_json::to_value(response)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
    Err(e) => serde_json::to_value(e)
      .map_err(|e| serde_json::json!({"status": "error", "message": e.to_string()})),
  }
}
