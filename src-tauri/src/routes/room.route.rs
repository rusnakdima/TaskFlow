use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_rooms(
  state: State<'_, AppState>,
  token: Option<String>,
  load: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let filter = serde_json::json!({
    "participant_ids": { "$in": [user_id] }
  });

  state
    .chat
    .room_service
    .get_all("all", Some(filter), None, None, load)
    .await
}

#[tauri::command]
pub async fn delete_room(
  state: State<'_, AppState>,
  room_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.room_service.delete(&room_id).await
}
