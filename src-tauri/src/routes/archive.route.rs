use crate::entities::response_entity::{DataValue, ResponseModel};
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

#[tauri::command]
pub async fn get_all_archive_data(
  state: State<'_, AppState>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");

  let provider = get_json_provider(&state);

  let all_todos = provider
    .find_many("todos", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

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

  let all_daily_activities = provider
    .find_many("daily_activities", None, None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let user_daily_activities: Vec<Value> = all_daily_activities
    .into_iter()
    .filter(|da| {
      let da_user_id = da.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
      da_user_id == user_id_str
    })
    .collect();

  let result = serde_json::json!({
    "todos": user_todos,
    "tasks": user_tasks,
    "subtasks": user_subtasks,
    "comments": user_comments,
    "chats": user_chats,
    "categories": user_categories,
    "daily_activities": user_daily_activities
  });

  Ok(success_response(DataValue::Object(result)))
}

#[tauri::command]
pub async fn get_all_archive_paginated(
  state: State<'_, AppState>,
  token: Option<String>,
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");

  let provider = get_json_provider(&state);

  match data_type.as_str() {
    "todos" => {
      let user_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let all_todos = provider
        .find_many(
          "todos",
          Some(&user_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(all_todos)))
    }
    "tasks" => {
      let todos_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let user_todos = provider
        .find_many("todos", Some(&todos_filter), None, None, None, true)
        .await
        .map_err(|e| err_response(&e.message))?;

      let todo_ids: Vec<String> = user_todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

      if todo_ids.is_empty() {
        return Ok(success_response(DataValue::Array(vec![])));
      }

      let tasks_filter = Filter::from_json(&serde_json::json!({ "todo_id": { "$in": todo_ids } }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let tasks = provider
        .find_many(
          "tasks",
          Some(&tasks_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(tasks)))
    }
    "subtasks" => {
      let tasks_filter = Filter::from_json(&serde_json::json!({}))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let all_tasks = provider
        .find_many("tasks", Some(&tasks_filter), None, None, None, true)
        .await
        .map_err(|e| err_response(&e.message))?;

      let task_ids: Vec<String> = all_tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

      if task_ids.is_empty() {
        return Ok(success_response(DataValue::Array(vec![])));
      }

      let subtasks_filter =
        Filter::from_json(&serde_json::json!({ "task_id": { "$in": task_ids } }))
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let subtasks = provider
        .find_many(
          "subtasks",
          Some(&subtasks_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(subtasks)))
    }
    "comments" => {
      let user_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let comments = provider
        .find_many(
          "comments",
          Some(&user_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(comments)))
    }
    "chats" => {
      let user_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let chats = provider
        .find_many(
          "chats",
          Some(&user_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(chats)))
    }
    "categories" => {
      let user_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let categories = provider
        .find_many(
          "categories",
          Some(&user_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(categories)))
    }
    "daily_activities" => {
      let user_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

      let activities = provider
        .find_many(
          "daily_activities",
          Some(&user_filter),
          Some(skip),
          Some(limit),
          None,
          true,
        )
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(activities)))
    }
    _ => {
      let all_data = provider
        .find_many(&data_type, None, Some(skip), Some(limit), None, true)
        .await
        .map_err(|e| err_response(&e.message))?;

      Ok(success_response(DataValue::Array(all_data)))
    }
  }
}

#[tauri::command]
pub async fn soft_delete(
  state: State<'_, AppState>,
  token: Option<String>,
  table: String,
  id: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_id(&state, &token)?;
  state
    .manage_db_service
    .toggle_delete_status(table, id, visibility)
    .await
}

#[tauri::command]
pub async fn permanent_delete(
  state: State<'_, AppState>,
  token: Option<String>,
  table: String,
  id: String,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _user_id = extract_user_id(&state, &token)?;
  state
    .manage_db_service
    .permanently_delete_record(table, id, visibility)
    .await
}
