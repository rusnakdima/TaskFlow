use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::AppState;
use tauri::State;

#[tauri::command]
#[allow(dead_code)]
pub async fn create_room(
  state: State<'_, AppState>,
  name: Option<String>,
  room: String,
  is_group: bool,
  participant_ids: Vec<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let data = serde_json::json!({
    "name": name,
    "room": room,
    "is_group": is_group,
    "participant_ids": participant_ids,
  });

  state.room_service.create(data).await
}

#[tauri::command]
#[allow(dead_code)]
pub async fn get_room(
  state: State<'_, AppState>,
  room_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.room_service.get_by_room(&room_id).await
}

#[tauri::command]
pub async fn get_rooms(
  state: State<'_, AppState>,
  token: Option<String>,
  load: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let filter = serde_json::json!({
    "participant_ids": { "$in": [user_id] }
  });

  state
    .room_service
    .get_all("all", Some(filter), None, None, load)
    .await
}

#[tauri::command]
#[allow(dead_code)]
pub async fn add_room_participants(
  state: State<'_, AppState>,
  room_id: String,
  participant_ids: Vec<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state
    .room_service
    .add_participants(&room_id, participant_ids)
    .await
}

#[tauri::command]
pub async fn delete_room(
  state: State<'_, AppState>,
  room_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.room_service.delete(&room_id).await
}
