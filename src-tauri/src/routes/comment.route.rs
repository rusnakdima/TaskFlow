use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::shared::types::CommentCreateRequest;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_comments(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());
  let effective_limit = limit.unwrap_or(100);
  let skip = page.map(|p| p * effective_limit);
  let limit = Some(effective_limit);
  state.comment_service.get_all(filter, skip, limit).await
}

#[tauri::command]
pub async fn create_comment(
  state: State<'_, AppState>,
  data: CommentCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  state.comment_service.create(data_value).await
}

#[tauri::command]
pub async fn delete_comment(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok())
    .ok_or_else(|| err_response("Unauthorized"))?;
  state.comment_service.delete(&id).await
}
