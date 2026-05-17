use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
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

  let user_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_todos = provider
    .find_many("todos", Some(&user_filter), None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let task_ids: Vec<String> = user_todos
    .iter()
    .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    .collect();

  let tasks_filter = Filter::from_json(&serde_json::json!({ "todo_id": { "$in": task_ids } }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_tasks = provider
    .find_many("tasks", Some(&tasks_filter), None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let subtask_task_ids: Vec<String> = user_tasks
    .iter()
    .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    .collect();

  let subtasks_filter =
    Filter::from_json(&serde_json::json!({ "task_id": { "$in": subtask_task_ids } }))
      .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_subtasks = provider
    .find_many("subtasks", Some(&subtasks_filter), None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let comments_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_comments = provider
    .find_many("comments", Some(&comments_filter), None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let chats_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_chats = provider
    .find_many("chats", Some(&chats_filter), None, None, None, true)
    .await
    .map_err(|e| err_response(&e.message))?;

  let categories_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_categories = provider
    .find_many(
      "categories",
      Some(&categories_filter),
      None,
      None,
      None,
      true,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

  let daily_activities_filter = Filter::from_json(&serde_json::json!({ "user_id": user_id_str }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

  let user_daily_activities = provider
    .find_many(
      "daily_activities",
      Some(&daily_activities_filter),
      None,
      None,
      None,
      true,
    )
    .await
    .map_err(|e| err_response(&e.message))?;

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
  dataType: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");

  let provider = get_json_provider(&state);

  match dataType.as_str() {
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
        .find_many(&dataType, None, Some(skip), Some(limit), None, true)
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
