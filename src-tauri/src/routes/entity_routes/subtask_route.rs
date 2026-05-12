use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::permission_service::PermissionService;
use crate::shared::types::{SubtaskCreateRequest, SubtaskUpdateRequest};
use crate::AppState;
use nosql_orm::query::Filter;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

fn extract_user_id(
  state: &AppState,
  token: &Option<String>,
) -> Result<Option<String>, ResponseModel> {
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(&state.config_helper.jwt_secret, t).ok());
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
      .ok_or_else(|| err_response("MongoDB not available"))
  }
}

async fn get_task_and_todo(
  state: &AppState,
  task_id: &str,
  visibility: &str,
) -> Result<(Value, Value), ResponseModel> {
  let provider = get_provider(state, visibility)?;
  let task = provider
    .find_by_id("tasks", task_id)
    .await
    .map_err(|e| err_response(&e.message))?
    .ok_or_else(|| err_response("Parent task not found"))?;
  let todo_id = task
    .get("todo_id")
    .and_then(|v: &serde_json::Value| v.as_str())
    .unwrap_or("");
  let todo = provider
    .find_by_id("todos", todo_id)
    .await
    .map_err(|e| err_response(&e.message))?
    .ok_or_else(|| err_response("Parent todo not found"))?;
  Ok((task, todo))
}

#[tauri::command]
pub async fn get_subtask(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let provider = get_provider(&state, &visibility)?;

  let doc = provider
    .find_by_id("subtasks", &id)
    .await
    .map_err(|e| err_response(&e.message))?;

  match doc {
    Some(subtask) => {
      let task_id = subtask
        .get("task_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
      let (_, todo) = get_task_and_todo(&state, task_id, &visibility).await?;
      let user_id_str = user_id.as_deref().unwrap_or("");
      if !PermissionService::can_view_todo(&todo, user_id_str) {
        return Err(err_response(
          "Unauthorized: You do not have permission to view this subtask",
        ));
      }
      Ok(success_response(serde_json::to_value(subtask).unwrap()))
    }
    None => Err(err_response("Subtask not found")),
  }
}

#[tauri::command]
pub async fn get_subtasks(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = "private".to_string();
  let page = page.unwrap_or(0);
  let limit = limit.unwrap_or(20);
  let skip = Some(page * limit);

  let provider = get_provider(&state, &visibility)?;

  let todos_filter = if let Some(uid) = &user_id {
    PermissionService::get_todo_filter_for_user(uid, Some(&visibility))
  } else {
    PermissionService::get_todo_filter_for_user("", Some(&visibility))
  };

  let todos = provider
    .find_many(
      "todos",
      Filter::from_json(&todos_filter).ok().as_ref(),
      None,
      None,
      None,
      true,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  let todo_ids: Vec<String> = todos
    .iter()
    .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    .collect();

  if todo_ids.is_empty() {
    let empty = serde_json::json!({
      "items": [],
      "page": page,
      "limit": limit,
      "has_more": false
    });
    return Ok(success_response(empty));
  }

  let tasks_filter = serde_json::json!({
    "todo_id": { "$in": todo_ids.clone() }
  });

  let tasks = provider
    .find_many(
      "tasks",
      Filter::from_json(&tasks_filter).ok().as_ref(),
      None,
      None,
      None,
      true,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  let task_ids: Vec<String> = tasks
    .iter()
    .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    .collect();

  if task_ids.is_empty() {
    let empty = serde_json::json!({
      "items": [],
      "page": page,
      "limit": limit,
      "has_more": false
    });
    return Ok(success_response(empty));
  }

  let mut subtask_filter = serde_json::json!({
    "task_id": { "$in": task_ids }
  });

  if let Some(user_filter) = filter {
    subtask_filter = serde_json::json!({
      "$and": [subtask_filter, user_filter]
    });
  }

  let filter_opt = Filter::from_json(&subtask_filter).ok();

  let docs = provider
    .find_many(
      "subtasks",
      filter_opt.as_ref(),
      skip,
      Some(limit),
      None,
      true,
    )
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
pub async fn create_subtask(
  state: State<'_, AppState>,
  data: SubtaskCreateRequest,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let user_id_str = user_id.as_deref().unwrap_or("");

  let (task, todo) = get_task_and_todo(&state, &data.task_id, &visibility).await?;
  if !PermissionService::can_add_task_to_todo(&todo, user_id_str) {
    return Err(err_response(
      "Unauthorized: You do not have permission to add subtasks to this todo",
    ));
  }

  let mut doc = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  if let Some(obj) = doc.as_object_mut() {
    obj.insert(
      "created_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.insert(
      "updated_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.insert("comments_count".to_string(), serde_json::json!(0));
    obj.insert("status".to_string(), serde_json::json!("pending"));
  }

  let provider = get_provider(&state, &visibility)?;
  let result = provider
    .insert("subtasks", doc)
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(result))
}

#[tauri::command]
pub async fn update_subtask(
  state: State<'_, AppState>,
  id: String,
  data: SubtaskUpdateRequest,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let provider = get_provider(&state, &visibility)?;

  let existing = provider
    .find_by_id("subtasks", &id)
    .await
    .map_err(|e| err_response(&e.message))?
    .ok_or_else(|| err_response("Subtask not found"))?;

  let task_id = existing
    .get("task_id")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let (task, todo) = get_task_and_todo(&state, task_id, &visibility).await?;

  let user_id_str = user_id.as_deref().unwrap_or("");
  if !PermissionService::can_edit_subtask(&existing, &task, &todo, user_id_str) {
    return Err(err_response(
      "Unauthorized: You do not have permission to edit this subtask",
    ));
  }

  let mut doc = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  if let Some(obj) = doc.as_object_mut() {
    obj.insert(
      "updated_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.remove("user_id");
    obj.remove("task_id");
  }

  let result = provider
    .update("subtasks", &id, doc)
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(result))
}

#[tauri::command]
pub async fn delete_subtask(
  state: State<'_, AppState>,
  id: String,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());

  let provider = get_provider(&state, &visibility)?;

  let existing = provider
    .find_by_id("subtasks", &id)
    .await
    .map_err(|e| err_response(&e.message))?
    .ok_or_else(|| err_response("Subtask not found"))?;

  let task_id = existing
    .get("task_id")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let (task, todo) = get_task_and_todo(&state, task_id, &visibility).await?;

  let user_id_str = user_id.as_deref().unwrap_or("");
  if !PermissionService::can_delete_subtask(&existing, &task, &todo, user_id_str) {
    return Err(err_response(
      "Unauthorized: You do not have permission to delete this subtask",
    ));
  }

  let result = provider
    .delete("subtasks", &id)
    .await
    .map_err(|e| err_response(&e.message))?;

  Ok(success_response(serde_json::json!({ "deleted": result })))
}
