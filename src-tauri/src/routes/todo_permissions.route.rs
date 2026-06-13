use tauri::State;

use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::{err_response, success_response};
use crate::helpers::visibility_helper::get_visibility;
use std::collections::HashMap;

#[tauri::command(rename_all = "snake_case")]
pub async fn change_todo_visibility(
  state: State<'_, crate::AppState>,
  todo_id: String,
  new_visibility: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  // First get the current todo to find its stored visibility
  let existing = state
    .data
    .repository_service
    .execute(
      "get".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      None,
      None,
      None,
      None,
      Some(user_id.clone()),
      None, // profile_id
      None,
      None,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  let doc = match existing.data {
    serde_json::Value::Object(obj) => obj,
    _ => return Err(err_response("Invalid response format")),
  };

  let doc_value = serde_json::to_value(&doc).unwrap_or_default();
  let old_visibility = get_visibility(&doc_value);

  if old_visibility == new_visibility.as_str() {
    return Ok(success_response(
      serde_json::json!({ "message": "Visibility unchanged" }),
    ));
  }

  // Update the todo with new visibility
  let update_data = serde_json::json!({
    "visibility": new_visibility
  });

  state
    .data
    .repository_service
    .execute(
      "update".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      Some(update_data),
      None,
      None,
      None,
      Some(user_id.clone()),
      None, // profile_id
      None,
      None,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  // Sync todo to the new provider
  let source_provider = match old_visibility {
    "private" => "Json",
    _ => "Mongo",
  };

  let target_provider = match new_visibility.as_str() {
    "private" => "Json",
    _ => "Mongo",
  };

  if source_provider != target_provider {
    let cascade_service = state.data.cascade_service.clone();
    cascade_service
      .sync_todo_with_children(
        &todo_id,
        source_provider,
        target_provider,
        &new_visibility,
        false,
      )
      .await
      .map_err(|e| err_response(&e.message))?;
  }

  Ok(success_response(
    serde_json::json!({ "message": "Visibility changed successfully" }),
  ))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_todo_permissions(
  state: State<'_, crate::AppState>,
  todo_id: String,
  assignee_roles: HashMap<String, String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let response_model = state
    .data
    .repository_service
    .execute(
      "update".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      Some(serde_json::json!({ "assignee_roles": assignee_roles })),
      None,
      None,
      None,
      Some(user_id),
      None, // profile_id
      None,
      None,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(
    serde_json::to_value(response_model).unwrap_or_default(),
  ))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn transfer_todo_ownership(
  state: State<'_, crate::AppState>,
  todo_id: String,
  new_user_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let response_model = state
    .data
    .repository_service
    .execute(
      "update".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      Some(serde_json::json!({ "user_id": new_user_id })),
      None,
      None,
      None,
      Some(user_id),
      None, // profile_id
      None,
      None,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(
    serde_json::to_value(response_model).unwrap_or_default(),
  ))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_todo_permissions(
  state: State<'_, crate::AppState>,
  todo_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = crate::helpers::auth_helper::extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let response = state
    .data
    .repository_service
    .execute(
      "get".to_string(),
      "todos".to_string(),
      Some(todo_id.clone()),
      None,
      None,
      None,
      None,
      Some(user_id),
      None, // profile_id
      None,
      None,
    )
    .await;

  let doc = match response {
    Ok(resp) => match resp.data {
      serde_json::Value::Object(obj) => obj,
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

  Ok(success_response(
    serde_json::json!({ "assignee_roles": assignee_roles }),
  ))
}
