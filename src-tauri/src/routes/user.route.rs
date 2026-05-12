use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::AppState;

use tauri::State;

#[tauri::command]
pub async fn get_users(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let effective_visibility = visibility.as_deref().unwrap_or("private");
  let page = page.unwrap_or(0);
  let limit = limit.unwrap_or(20);
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());

  let skip = Some(page * limit);
  let limit_opt = Some(limit);
  let result = state
    .repository_service
    .execute(
      "getAll".to_string(),
      "users".to_string(),
      None,
      None,
      None,
      None,
      Some(effective_visibility.to_string()),
      false,
      user_id,
      skip,
      limit_opt,
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
    Err(e) => Err(crate::helpers::response_helper::err_response(&e.message)),
  }
}
