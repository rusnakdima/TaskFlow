use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::auth_helper::{extract_user_from_token, validate_admin_role};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::AppState;
use nosql_orm::prelude::DatabaseProvider;
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
  let provider = get_json_provider(&state);

  // If no token provided (admin viewing all archive), return all data without user filter
  if user_id.is_none() {
    let all_todos = provider
      .find_many("todos", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let all_tasks = provider
      .find_many("tasks", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let all_subtasks = provider
      .find_many("subtasks", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let all_comments = provider
      .find_many("comments", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let all_chats = provider
      .find_many("chats", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let all_categories = provider
      .find_many("categories", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let all_activities = provider
      .find_many("daily_activities", None, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.message))?;

    let result = serde_json::json!({
      "todos": all_todos,
      "tasks": all_tasks,
      "subtasks": all_subtasks,
      "comments": all_comments,
      "chats": all_chats,
      "categories": all_categories,
      "daily_activities": all_activities
    });

    return Ok(success_response(DataValue::Object(result)));
  }

  let user_id_str = user_id.unwrap();

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
  data_type: String,
  skip: u64,
  limit: u64,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;

  let provider = get_json_provider(&state);

  // If no token provided (admin viewing all archive), return all data without user filter
  if user_id.is_none() {
    match data_type.as_str() {
      "todos" => {
        let all_todos = provider
          .find_many("todos", None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_todos)))
      }
      "tasks" => {
        let all_tasks = provider
          .find_many("tasks", None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_tasks)))
      }
      "subtasks" => {
        let all_subtasks = provider
          .find_many("subtasks", None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_subtasks)))
      }
      "comments" => {
        let all_comments = provider
          .find_many("comments", None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_comments)))
      }
      "chats" => {
        let all_chats = provider
          .find_many("chats", None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_chats)))
      }
      "categories" => {
        let all_categories = provider
          .find_many("categories", None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_categories)))
      }
      "daily_activities" => {
        let all_activities = provider
          .find_many(
            "daily_activities",
            None,
            Some(skip),
            Some(limit),
            None,
            true,
          )
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_activities)))
      }
      _ => {
        let all_data = provider
          .find_many(&data_type, None, Some(skip), Some(limit), None, true)
          .await
          .map_err(|e| err_response(&e.message))?;
        Ok(success_response(DataValue::Array(all_data)))
      }
    }
  } else {
    let user_id_str = user_id.unwrap();
    // User-specific archive data (existing behavior)
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

        let tasks_filter =
          Filter::from_json(&serde_json::json!({ "todo_id": { "$in": todo_ids } }))
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
}

#[tauri::command]
pub async fn soft_delete(
  state: State<'_, AppState>,
  token: Option<String>,
  table: String,
  id: String,
  todo_id: Option<String>,
  visibility: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let is_global_admin = validate_admin_role(
    token.as_deref().unwrap_or(""),
    &state.config_helper.jwt_secret,
    &state.json_provider,
    state.mongodb_provider.as_ref(),
  )
  .await
  .is_ok();

  if let Some(tid) = todo_id {
    let todo_json = state.json_provider.find_by_id("todos", &tid).await;
    let todo = if let Ok(Some(t)) = todo_json {
      Some(t)
    } else if let Some(mongo) = state.mongodb_provider.as_ref() {
      match mongo.find_by_id("todos", &tid).await {
        Ok(Some(t)) => Some(t),
        _ => None,
      }
    } else {
      None
    };

    let todo = todo.ok_or_else(|| err_response("Todo not found"))?;

    let user_id_str = user_id
      .as_ref()
      .ok_or_else(|| err_response("User not found"))?;
    let permission = crate::services::permission_service::PermissionService::get_todo_permission_with_profile_and_admin(
      &todo,
      user_id_str,
      None,
      is_global_admin,
    );

    if let Some(perm) = permission {
      match table.as_str() {
        "todos" => {
          if !perm.can_archive_todo() {
            return Err(err_response(
              "You don't have permission to archive this project",
            ));
          }
        }
        "tasks" | "subtasks" | "comments" => {
          let can_archive = if perm.can_archive_task()
            || perm.can_archive_subtask()
            || perm.can_archive_comment()
          {
            true
          } else if perm == crate::entities::permission_entity::TodoPermission::EDITOR {
            let mut item: Option<serde_json::Value> = None;
            if table == "tasks" {
              if let Ok(Some(i)) = state.json_provider.find_by_id("tasks", &id).await {
                item = Some(i);
              } else if let Some(m) = state.mongodb_provider.as_ref() {
                if let Ok(Some(i)) = m.find_by_id("tasks", &id).await {
                  item = Some(i);
                }
              }
            } else if table == "subtasks" {
              if let Ok(Some(i)) = state.json_provider.find_by_id("subtasks", &id).await {
                item = Some(i);
              } else if let Some(m) = state.mongodb_provider.as_ref() {
                if let Ok(Some(i)) = m.find_by_id("subtasks", &id).await {
                  item = Some(i);
                }
              }
            } else {
              if let Ok(Some(i)) = state.json_provider.find_by_id("comments", &id).await {
                item = Some(i);
              } else if let Some(m) = state.mongodb_provider.as_ref() {
                if let Ok(Some(i)) = m.find_by_id("comments", &id).await {
                  item = Some(i);
                }
              }
            };
            if let Some(i) = item {
              i.get("user_id").and_then(|v| v.as_str()) == Some(user_id_str)
            } else {
              false
            }
          } else {
            false
          };
          if !can_archive {
            return Err(err_response(&format!(
              "You don't have permission to archive this {}",
              table
            )));
          }
        }
        _ => {}
      }
    }
  }

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
