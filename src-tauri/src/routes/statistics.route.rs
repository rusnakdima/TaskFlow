/* sys lib */
use crate::entities::response_entity::ResponseModel;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn statistics_get(
  state: State<'_, AppState>,
  user_id: String,
  time_range: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .statistics_service
    .get_statistics(user_id, time_range, "private".to_string())
    .await
}
