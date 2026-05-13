use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::permission_service::PermissionService;
use crate::shared::types::{TodoCreateRequest, TodoUpdateRequest};
use crate::AppState;
use nosql_orm::query::Filter;
use std::sync::Arc;
use tauri::State;

fn extract_user_id(
  state: &AppState,
  token: &Option<String>,
) -> Result<Option<String>, ResponseModel> {
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(t, &state.config_helper.jwt_secret).ok());
  Ok(user_id)
}

fn get_provider(state: &AppState, visibility: &str) -> Result<DataProvider, ResponseModel> {
  let offline = std::env::var("OFFLINE_MODE").unwrap_or_default() == "true";
  let use_json = visibility == "private" || offline || visibility == "all";

  if use_json {
    Ok(DataProvider::Json(Arc::new(state.json_provider.clone())))
  } else {
    state
      .mongodb_provider
      .clone()
      .map(DataProvider::Mongo)
      .ok_or_else(|| {
        err_response(
          "MongoDB not available - cannot create shared/team records. Please connect to the internet or change todo visibility to private.",
        )
      })
  }
}

#[tauri::command]
pub async fn get_todo(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let provider = get_provider(&state, &visibility)?;

  let doc = provider
    .find_by_id("todos", &id)
    .await
    .map_err(|e| err_response(&e.message))?;

  match doc {
    Some(todo) => {
      if !PermissionService::can_view_todo(&todo, user_id.as_deref().unwrap_or("")) {
        return Err(err_response(
          "Unauthorized: You do not have permission to view this todo",
        ));
      }
      Ok(success_response(serde_json::to_value(todo).unwrap()))
    }
    None => Err(err_response("Todo not found")),
  }
}

#[tauri::command]
pub async fn get_todos(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());
  let page = page.unwrap_or(0);
  let limit = std::cmp::min(limit.unwrap_or(10), 10);
  let skip = Some(page * limit);

  let mut final_filter = if let Some(uid) = &user_id {
    PermissionService::get_todo_filter_for_user(uid, Some(&visibility))
  } else {
    PermissionService::get_todo_filter_for_user("", Some(&visibility))
  };

  if let Some(user_filter) = filter {
    final_filter = serde_json::json!({
      "$and": [final_filter, user_filter]
    });
  }

  let filter_opt = Filter::from_json(&final_filter).ok();

  let provider = get_provider(&state, &visibility)?;
  let docs = provider
    .find_many("todos", filter_opt.as_ref(), skip, Some(limit), None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let paginated = serde_json::json!({
    "items": docs,
    "page": page,
    "limit": limit,
    "has_more": true
  });

  Ok(success_response(paginated))
}

#[tauri::command]
pub async fn create_todo(
  state: State<'_, AppState>,
  data: TodoCreateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = data.visibility.clone();

  let user_id_str = user_id.as_deref().unwrap_or("");

  let mut doc = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  if let Some(obj) = doc.as_object_mut() {
    obj.insert("user_id".to_string(), serde_json::json!(user_id_str));
    obj.insert(
      "created_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.insert(
      "updated_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.insert("tasks_count".to_string(), serde_json::json!(0));
    obj.insert("completed_tasks_count".to_string(), serde_json::json!(0));
  }

  let provider = get_provider(&state, &visibility)?;
  let result = provider
    .insert("todos", doc)
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(result))
}

#[tauri::command]
pub async fn update_todo(
  state: State<'_, AppState>,
  id: String,
  data: TodoUpdateRequest,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let provider = get_provider(&state, &visibility)?;

  let existing = provider
    .find_by_id("todos", &id)
    .await
    .map_err(|e| err_response(&e.message))?
    .ok_or_else(|| err_response("Todo not found"))?;

  let user_id_str = user_id.as_deref().unwrap_or("");
  if !PermissionService::can_edit_todo(&existing, user_id_str) {
    return Err(err_response(
      "Unauthorized: You do not have permission to edit this todo",
    ));
  }

  let mut doc = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  if let Some(obj) = doc.as_object_mut() {
    obj.insert(
      "updated_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.remove("user_id");
    obj.remove("assignee_roles");
  }

  let result = provider
    .update("todos", &id, doc)
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(result))
}

#[tauri::command]
pub async fn delete_todo(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let provider = get_provider(&state, &visibility)?;

  let existing = provider
    .find_by_id("todos", &id)
    .await
    .map_err(|e| err_response(&e.message))?
    .ok_or_else(|| err_response("Todo not found"))?;

  let user_id_str = user_id.as_deref().unwrap_or("");
  if !PermissionService::can_delete_todo(&existing, user_id_str) {
    return Err(err_response(
      "Unauthorized: You do not have permission to delete this todo",
    ));
  }

  let result = provider
    .delete("todos", &id)
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(serde_json::json!({ "deleted": result })))
}
