use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct PermissionService {
  #[allow(dead_code)]
  jwt_secret: String,
}

impl PermissionService {
  pub fn new(jwt_secret: String) -> Self {
    Self { jwt_secret }
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
    let owner_id = todo.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    owner_id == user_id
  }

  pub fn can_delete_todo(todo: &Value, user_id: &str) -> bool {
    Self::can_edit_todo(todo, user_id)
  }

  pub fn can_add_task_to_todo(todo: &Value, user_id: &str) -> bool {
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

  pub fn can_edit_task(task: &Value, todo: &Value, user_id: &str) -> bool {
    let todo_visibility = todo
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");
    let todo_owner_id = todo.get("user_id").and_then(|v| v.as_str()).unwrap_or("");
    let task_creator_id = task.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

    match todo_visibility {
      "private" => todo_owner_id == user_id,
      "shared" => todo_owner_id == user_id || task_creator_id == user_id,
      "public" => task_creator_id == user_id,
      _ => false,
    }
  }

  pub fn can_delete_task(task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_task(task, todo, user_id)
  }

  pub fn can_edit_subtask(_subtask: &Value, task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_task(task, todo, user_id)
  }

  pub fn can_delete_subtask(_subtask: &Value, task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_subtask(_subtask, task, todo, user_id)
  }

  pub fn can_edit_comment(comment: &Value, _task: &Value, todo: &Value, user_id: &str) -> bool {
    let comment_creator_id = comment
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let todo_visibility = todo
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");
    let todo_owner_id = todo.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

    match todo_visibility {
      "private" => todo_owner_id == user_id || comment_creator_id == user_id,
      "shared" => todo_owner_id == user_id || comment_creator_id == user_id,
      "public" => comment_creator_id == user_id,
      _ => false,
    }
  }

  pub fn can_delete_comment(comment: &Value, task: &Value, todo: &Value, user_id: &str) -> bool {
    Self::can_edit_comment(comment, task, todo, user_id)
  }

  pub fn get_todo_filter_for_user(user_id: &str, visibility: Option<&str>) -> Value {
    let base_filter = match visibility.unwrap_or("private") {
      "private" => {
        json!({ "user_id": user_id })
      }
      "shared" => {
        json!({
            "$or": [
                { "user_id": user_id },
                { "visibility": "shared", "assignees": { "$in": [user_id] } }
            ]
        })
      }
      "public" => {
        json!({
            "$or": [
                { "user_id": user_id },
                { "visibility": "shared", "assignees": { "$in": [user_id] } },
                { "visibility": "public" }
            ]
        })
      }
      _ => {
        json!({ "user_id": user_id })
      }
    };
    base_filter
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
