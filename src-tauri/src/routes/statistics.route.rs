/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{response_model::ResponseModel, sync_metadata_model::SyncMetadata};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn statisticsGet(
  state: State<'_, AppState>,
  userId: String,
  timeRange: String,
) -> Result<ResponseModel, ResponseModel> {
  let syncMetadata = SyncMetadata {
    isOwner: true,
    isPrivate: true,
  };
  state
    .statisticsController
    .getStatistics(userId, timeRange, syncMetadata)
    .await
}
