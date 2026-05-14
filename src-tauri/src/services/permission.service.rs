use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct PermissionService {}

impl PermissionService {
  pub fn new() -> Self {
    Self {}
  }

  fn is_admin_assignee(todo: &Value, user_id: &str) -> bool {
    let assignees = todo.get("assignees").and_then(|v| v.as_array());
    let assignee_roles = todo.get("assignee_roles").and_then(|v| {
      if let Some(obj) = v.as_object() {
        Some(obj)
      } else {
        None
      }
    });

    if let (Some(arr), Some(roles)) = (assignees, assignee_roles) {
      for (i, assignee) in arr.iter().enumerate() {
        if assignee.as_str() == Some(user_id) {
          let key = i.to_string();
          if let Some(role) = roles.get(&key) {
            if role.as_str() == Some("admin") {
              return true;
            }
          }
        }
      }
    }
    false
  }

  fn is_owner_or_admin(todo: &Value, user_id: &str) -> bool {
    let owner_id = todo.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    owner_id == user_id || Self::is_admin_assignee(todo, user_id)
  }

  pub fn can_view_todo(todo: &Value, user_id: &str) -> bool {
    let visibility = todo
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");
    let owner_id = todo.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    let assignees = todo.get("assignees").and_then(|v| v.as_array());

    match visibility {
      "private" => owner_id == user_id,
      "shared" => {
        owner_id == user_id
          || assignees
            .map(|a| a.iter().any(|id| id.as_str() == Some(user_id)))
            .unwrap_or(false)
      }
      "public" => true,
      _ => false,
    }
  }

  pub fn can_edit_todo(todo: &Value, user_id: &str) -> bool {
    Self::is_owner_or_admin(todo, user_id)
  }

  pub fn can_delete_todo(todo: &Value, user_id: &str) -> bool {
    Self::is_owner_or_admin(todo, user_id)
  }

  pub fn can_add_task_to_todo(todo: &Value, user_id: &str) -> bool {
    Self::can_view_todo(todo, user_id)
  }

  pub fn can_edit_task(task: &Value, todo: &Value, user_id: &str) -> bool {
    let task_creator_id = task.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

    if task_creator_id == user_id {
      return true;
    }

    Self::is_owner_or_admin(todo, user_id)
  }

  pub fn can_delete_task(task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_task(task, todo, user_id)
  }

  pub fn can_edit_subtask(subtask: &Value, task: &Value, todo: &Value, user_id: &str) -> bool {
    let subtask_creator_id = subtask
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if subtask_creator_id == user_id {
      return true;
    }

    let task_creator_id = task.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

    if task_creator_id == user_id {
      return true;
    }

    Self::is_owner_or_admin(todo, user_id)
  }

  pub fn can_delete_subtask(subtask: &Value, task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_subtask(subtask, task, todo, user_id)
  }

  pub fn can_edit_comment(comment: &Value, _task: &Value, todo: &Value, user_id: &str) -> bool {
    let comment_creator_id = comment
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if comment_creator_id == user_id {
      return true;
    }

    Self::is_owner_or_admin(todo, user_id)
  }

  pub fn can_delete_comment(comment: &Value, task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_comment(comment, task, todo, user_id)
  }

  pub fn get_todo_filter_for_user(user_id: &str, visibility: Option<&str>) -> Value {
    match visibility.unwrap_or("private") {
      "private" => {
        json!({
            "visibility": "private",
            "user_id": user_id
        })
      }
      "shared" => {
        json!({
            "visibility": "shared",
            "$or": [
                { "user_id": user_id },
                { "assignees": { "$in": [user_id] } }
            ]
        })
      }
      "public" => {
        json!({
            "visibility": "public"
        })
      }
      "all" => {
        json!({
            "$or": [
                { "visibility": "private", "user_id": user_id },
                { "visibility": "shared", "assignees": { "$in": [user_id] } },
                { "visibility": "public" }
            ]
        })
      }
      _ => {
        json!({ "visibility": "private", "user_id": user_id })
      }
    }
  }

  pub fn get_tasks_filter_for_user(user_id: &str) -> Value {
    json!({
        "$or": [
            { "user_id": user_id },
            { "visibility": "public" }
        ]
    })
  }

  pub fn can_view_category(category: &Value, user_id: &str) -> bool {
    let visibility = category
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");
    let owner_id = category
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    match visibility {
      "private" => owner_id == user_id,
      "shared" => owner_id == user_id,
      "public" => true,
      _ => false,
    }
  }

  pub fn can_edit_category(category: &Value, user_id: &str) -> bool {
    let owner_id = category
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    owner_id == user_id
  }

  pub fn can_delete_category(category: &Value, user_id: &str) -> bool {
    Self::can_edit_category(category, user_id)
  }

  pub fn get_category_filter_for_user(user_id: &str, visibility: Option<&str>) -> Value {
    match visibility.unwrap_or("private") {
      "private" => {
        json!({ "user_id": user_id })
      }
      "shared" => {
        json!({
            "$or": [
                { "user_id": user_id },
                { "visibility": "shared" }
            ]
        })
      }
      "public" => {
        json!({
            "$or": [
                { "user_id": user_id },
                { "visibility": "shared" },
                { "visibility": "public" }
            ]
        })
      }
      _ => {
        json!({ "user_id": user_id })
      }
    }
  }
}
