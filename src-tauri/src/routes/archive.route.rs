use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
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
    .and_then(|t| extract_user_from_token(t, &state.config_helper.jwt_secret).ok());
  Ok(user_id)
}

fn get_json_provider(state: &AppState) -> DataProvider {
  DataProvider::Json(Arc::new(state.json_provider.clone()))
}

fn is_deleted(doc: &Value) -> bool {
  doc.get("deleted_at").map(|v| !v.is_null()).unwrap_or(false)
}

#[tauri::command]
pub async fn get_all_archive_data(
  state: State<'_, AppState>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");

  eprintln!(
    "DEBUG archive: user_id={:?}, user_id_str='{}'",
    user_id, user_id_str
  );

  let provider = get_json_provider(&state);

  let all_todos = provider
    .find_many("todos", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  eprintln!(
    "DEBUG archive: total todos in DB: {}, user_id_str for filter: '{}'",
    all_todos.len(),
    user_id_str
  );

  let user_todos: Vec<Value> = all_todos
    .into_iter()
    .filter(|t| {
      let t_user_id = t.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
      t_user_id == user_id_str
    })
    .collect();

  let task_ids: Vec<String> = user_todos
    .iter()
    .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    .collect();

  let all_tasks = provider
    .find_many("tasks", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let user_tasks: Vec<Value> = all_tasks
    .into_iter()
    .filter(|t| {
      if let Some(todo_id) = t.get("todo_id").and_then(|v| v.as_str()) {
        task_ids.contains(&todo_id.to_string())
      } else {
        false
      }
    })
    .collect();

  let subtask_task_ids: Vec<String> = user_tasks
    .iter()
    .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    .collect();

  let all_subtasks = provider
    .find_many("subtasks", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let user_subtasks: Vec<Value> = all_subtasks
    .into_iter()
    .filter(|t| {
      if let Some(task_id) = t.get("task_id").and_then(|v| v.as_str()) {
        subtask_task_ids.contains(&task_id.to_string())
      } else {
        false
      }
    })
    .collect();

  let all_comments = provider
    .find_many("comments", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let user_comments: Vec<Value> = all_comments
    .into_iter()
    .filter(|c| {
      let c_user_id = c.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
      c_user_id == user_id_str
    })
    .collect();

  let all_chats = provider
    .find_many("chats", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let user_chats: Vec<Value> = all_chats
    .into_iter()
    .filter(|c| {
      let c_user_id = c.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
      c_user_id == user_id_str
    })
    .collect();

  let all_categories = provider
    .find_many("categories", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let user_categories: Vec<Value> = all_categories
    .into_iter()
    .filter(|c| {
      let c_user_id = c.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
      c_user_id == user_id_str
    })
    .collect();

  let daily_activities = provider
    .find_many("daily_activities", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let result = serde_json::json!({
    "todos": user_todos,
    "tasks": user_tasks,
    "subtasks": user_subtasks,
    "comments": user_comments,
    "chats": user_chats,
    "categories": user_categories,
    "daily_activities": daily_activities
  });

  Ok(success_response(DataValue::Object(result)))
}
