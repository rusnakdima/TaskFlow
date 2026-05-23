use serde_json::{json, Value};

use crate::entities::permission_entity::{TodoPermission, ASSIGNEE_DEFAULT_ROLE};

#[derive(Debug, Clone)]
pub struct PermissionService {}

impl PermissionService {
  pub fn get_todo_permission(todo: &Value, user_id: &str) -> Option<TodoPermission> {
    Self::get_todo_permission_with_profile(todo, user_id, None)
  }

  pub fn get_todo_permission_with_profile(
    todo: &Value,
    user_id: &str,
    profile_id: Option<&str>,
  ) -> Option<TodoPermission> {
    let owner_id = todo.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

    if owner_id == user_id {
      return Some(TodoPermission::OWNER);
    }

    let assignees = todo.get("assignees").and_then(|v| v.as_array())?;
    let assignee_roles = todo.get("assignee_roles").and_then(|v| v.as_object());

    for assignee_id in assignees {
      let assignee_str = assignee_id.as_str()?;

      let role = assignee_roles
        .and_then(|r| r.get(assignee_str))
        .and_then(|v| v.as_str())
        .unwrap_or(ASSIGNEE_DEFAULT_ROLE);

      if assignee_str == profile_id.unwrap_or("") || assignee_str == user_id {
        return Some(TodoPermission::from_str(role));
      }
    }

    let visibility = todo
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");
    match visibility {
      "public" => Some(TodoPermission::VIEWER),
      "shared" => {
        if let Some(pid) = profile_id {
          if assignees.iter().any(|a| a.as_str() == Some(pid)) {
            return Some(TodoPermission::VIEWER);
          }
        }
        if assignees.iter().any(|a| a.as_str() == Some(user_id)) {
          Some(TodoPermission::VIEWER)
        } else {
          None
        }
      }
      _ => None,
    }
  }

  pub fn is_owner_or_admin(todo: &Value, user_id: &str) -> bool {
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      return permission == TodoPermission::ADMIN || permission == TodoPermission::OWNER;
    }
    false
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
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      return permission.can_edit_todo_fields();
    }
    false
  }

  pub fn can_manage_assignees(todo: &Value, user_id: &str) -> bool {
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      return permission == TodoPermission::OWNER;
    }
    false
  }

  pub fn can_delete_todo(todo: &Value, user_id: &str) -> bool {
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      return permission.can_delete_todo();
    }
    false
  }

  pub fn can_add_task_to_todo(todo: &Value, user_id: &str) -> bool {
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      return permission.can_create_task();
    }
    Self::can_view_todo(todo, user_id)
  }

  pub fn can_edit_task(task: &Value, todo: &Value, user_id: &str) -> bool {
    if Self::is_owner_or_admin(todo, user_id) {
      return true;
    }
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      if permission.can_edit_task() {
        let task_creator_id = task.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
        return task_creator_id == user_id;
      }
    }
    false
  }

  pub fn can_delete_task(task: &Value, todo: &Value, user_id: &str) -> bool {
    if Self::is_owner_or_admin(todo, user_id) {
      return true;
    }
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      if permission.can_delete_task() {
        let task_creator_id = task.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
        return task_creator_id == user_id;
      }
    }
    false
  }

  pub fn can_edit_subtask(subtask: &Value, _task: &Value, todo: &Value, user_id: &str) -> bool {
    if Self::is_owner_or_admin(todo, user_id) {
      return true;
    }
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      if permission.can_edit_subtask() {
        let subtask_creator_id = subtask
          .get("user_id")
          .and_then(|v| v.as_str())
          .unwrap_or("");
        return subtask_creator_id == user_id;
      }
    }
    false
  }

  pub fn can_delete_subtask(subtask: &Value, _task: &Value, todo: &Value, user_id: &str) -> bool {
    if Self::is_owner_or_admin(todo, user_id) {
      return true;
    }
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      if permission.can_delete_subtask() {
        let subtask_creator_id = subtask
          .get("user_id")
          .and_then(|v| v.as_str())
          .unwrap_or("");
        return subtask_creator_id == user_id;
      }
    }
    false
  }

  pub fn can_edit_comment(comment: &Value, _task: &Value, todo: &Value, user_id: &str) -> bool {
    if Self::is_owner_or_admin(todo, user_id) {
      return true;
    }
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      if permission.can_edit_comment() {
        let comment_creator_id = comment
          .get("user_id")
          .and_then(|v| v.as_str())
          .unwrap_or("");
        return comment_creator_id == user_id;
      }
    }
    false
  }

  pub fn can_delete_comment(comment: &Value, _task: &Value, todo: &Value, user_id: &str) -> bool {
    if Self::is_owner_or_admin(todo, user_id) {
      return true;
    }
    if let Some(permission) = Self::get_todo_permission(todo, user_id) {
      if permission.can_delete_comment() {
        let comment_creator_id = comment
          .get("user_id")
          .and_then(|v| v.as_str())
          .unwrap_or("");
        return comment_creator_id == user_id;
      }
    }
    false
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
            "visibility": "public",
            "$or": [
                { "user_id": user_id },
                { "assignees": { "$in": [user_id] } }
            ]
        })
      }
      "all" => {
        json!({
            "$or": [
                { "visibility": "private", "user_id": user_id },
                { "visibility": "shared", "$or": [{ "user_id": user_id }, { "assignees": { "$in": [user_id] } }] },
                { "visibility": "public", "$or": [{ "user_id": user_id }, { "assignees": { "$in": [user_id] } }] }
            ]
        })
      }
      _ => {
        json!({ "visibility": "private", "user_id": user_id })
      }
    }
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
