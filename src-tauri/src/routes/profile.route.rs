/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::entities::response_entity::ResponseModel;

/// Sync profile to cloud MongoDB - call after create/update via manage_data
#[tauri::command]
pub async fn profile_sync_to_cloud(
  state: State<'_, AppState>,
  profile_id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .profile_service
    .sync_profile_to_cloud(profile_id)
    .await
}

/// Sync all profiles for user to cloud - bulk sync operation
#[tauri::command]
pub async fn profile_sync_all_for_user(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .profile_service
    .sync_all_profiles_for_user(user_id)
    .await
}
