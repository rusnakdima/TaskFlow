use tauri::State;

use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use std::collections::HashMap;

#[tauri::command]
pub async fn update_todo_permissions(
  state: State<'_, crate::AppState>,
  todo_id: String,
  assignee_roles: HashMap<String, String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let response_model = state
    .repository_service
    .execute(
      "update".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      Some(serde_json::json!({ "assignee_roles": assignee_roles })),
      None,
      None,
      None,
      true,
      Some(user_id),
      None,
      None,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(DataValue::Object(
    serde_json::to_value(response_model).unwrap_or_default(),
  )))
}

#[tauri::command]
pub async fn transfer_todo_ownership(
  state: State<'_, crate::AppState>,
  todo_id: String,
  new_user_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let response_model = state
    .repository_service
    .execute(
      "update".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      Some(serde_json::json!({ "user_id": new_user_id })),
      None,
      None,
      None,
      true,
      Some(user_id),
      None,
      None,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(DataValue::Object(
    serde_json::to_value(response_model).unwrap_or_default(),
  )))
}

#[tauri::command]
pub async fn get_todo_permissions(
  state: State<'_, crate::AppState>,
  todo_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let response = state
    .repository_service
    .execute(
      "get".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      None,
      None,
      None,
      None,
      true,
      Some(user_id),
      None,
      None,
    )
    .await;

  let doc = match response {
    Ok(resp) => match resp.data {
      crate::entities::response_entity::DataValue::Object(obj) => obj,
      _ => return Err(err_response("Invalid response format")),
    },
    Err(e) => return Err(err_response(&e.message)),
  };

  let assignee_roles: HashMap<String, String> = doc
    .get("assignee_roles")
    .and_then(|v: &serde_json::Value| v.as_object())
    .map(|obj: &serde_json::Map<String, serde_json::Value>| {
      obj
        .iter()
        .map(|(k, v): (&String, &serde_json::Value)| {
          (k.clone(), v.as_str().unwrap_or("viewer").to_string())
        })
        .collect()
    })
    .unwrap_or_default();

  Ok(success_response(DataValue::Object(
    serde_json::json!({ "assignee_roles": assignee_roles }),
  )))
}
