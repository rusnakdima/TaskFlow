use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::shared::types::{ChatCreateRequest, ChatUpdateRequest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_chats(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());
  let effective_limit = limit.unwrap_or(20);
  let skip = page.map(|p| p * effective_limit);
  let limit = Some(effective_limit);
  state.chat_service.get_all(filter, skip, limit).await
}

#[tauri::command]
pub async fn create_chat(
  state: State<'_, AppState>,
  data: ChatCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.chat_service.create(data_value).await
}

#[tauri::command]
pub async fn update_chat(
  state: State<'_, AppState>,
  id: String,
  data: ChatUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.chat_service.update(&id, data_value).await
}

#[tauri::command]
pub async fn delete_chat(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  state.chat_service.delete(&id).await
}
