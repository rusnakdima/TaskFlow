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
  let statisticsService = StatisticsService::new(
    state.crudService.jsonProvider.clone(),
    state.crudService.mongodbProvider.clone().unwrap(),
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
    Ok(response) => Ok(serde_json::to_value(response).unwrap()),
    Err(e) => Err(serde_json::to_value(e).unwrap()),
  }
}
