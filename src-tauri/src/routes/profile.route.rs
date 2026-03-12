/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

/// Sync profile to cloud MongoDB - call after create/update via manageData
#[tauri::command]
pub async fn profileSyncToCloud(
  state: State<'_, AppState>,
  profileId: String,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.syncProfileToCloud(profileId).await
}

/// Sync all profiles for user to cloud - bulk sync operation
#[tauri::command]
pub async fn profileSyncAllForUser(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  state.profileService.syncAllProfilesForUser(userId).await
}
