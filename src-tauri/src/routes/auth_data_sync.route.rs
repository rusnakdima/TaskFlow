/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::entities::response_entity::ResponseModel;

/* helpers */
use crate::helpers::response_helper::success_response;

#[tauri::command]
pub async fn initialize_user_data(
  state: State<'_, AppState>,
  user_id: String,
) -> Result<ResponseModel, ResponseModel> {
  let result = state
    .auth_data_sync_service
    .initialize_user_data(&user_id)
    .await?;
  Ok(success_response(
    serde_json::to_value(result).unwrap_or(serde_json::json!({})),
  ))
}
