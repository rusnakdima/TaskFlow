use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::AppState;
use tauri::State;

pub async fn handle_get(
  state: &State<'_, AppState>,
  table: &str,
  id: String,
  visibility: Option<String>,
  load: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_visibility = visibility.as_deref().unwrap_or("private");
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());

  state
    .repository_service
    .execute(
      "get".to_string(),
      table.to_string(),
      Some(id),
      None,
      None,
      load,
      Some(effective_visibility.to_string()),
      false,
      user_id,
    )
    .await
}

pub async fn handle_get_all(
  state: &State<'_, AppState>,
  table: &str,
  page: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  filter: Option<serde_json::Value>,
  load: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_visibility = visibility.as_deref().unwrap_or("private");
  let page = page.unwrap_or(0);
  let limit = limit.unwrap_or(20);
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());

  let result = state
    .repository_service
    .execute(
      "getAll".to_string(),
      table.to_string(),
      None,
      None,
      filter,
      load,
      Some(effective_visibility.to_string()),
      false,
      user_id,
    )
    .await;

  match result {
    Ok(mut response) => {
      let items_data = response.data;
      let paginated = serde_json::json!({
          "items": items_data,
          "page": page,
          "limit": limit,
          "has_more": true
      });
      response.data = DataValue::Object(paginated);
      Ok(response)
    }
    Err(e) => Err(err_response(&e.message)),
  }
}

pub async fn handle_create<T: serde::Serialize>(
  state: &State<'_, AppState>,
  table: &str,
  data: T,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  let effective_visibility = visibility.unwrap_or_else(|| "private".to_string());
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());

  state
    .repository_service
    .execute(
      "create".to_string(),
      table.to_string(),
      None,
      Some(data_value),
      None,
      None,
      Some(effective_visibility),
      false,
      user_id,
    )
    .await
}

pub async fn handle_update<T: serde::Serialize>(
  state: &State<'_, AppState>,
  table: &str,
  id: String,
  data: T,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let data_value = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;
  let effective_visibility = visibility.unwrap_or_else(|| "private".to_string());
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());

  state
    .repository_service
    .execute(
      "update".to_string(),
      table.to_string(),
      Some(id),
      Some(data_value),
      None,
      None,
      Some(effective_visibility),
      false,
      user_id,
    )
    .await
}

pub async fn handle_delete(
  state: &State<'_, AppState>,
  table: &str,
  id: String,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_visibility = visibility.as_deref().unwrap_or("private");
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());

  state
    .repository_service
    .execute(
      "delete".to_string(),
      table.to_string(),
      Some(id),
      None,
      None,
      None,
      Some(effective_visibility.to_string()),
      false,
      user_id,
    )
    .await
}
