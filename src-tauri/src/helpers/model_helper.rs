/* sys lib */
use serde_json::{json, Value};
use uuid::Uuid;

use super::timestamp_helper::getCurrentTimestamp;

/// Ensure all required fields are present in a record based on table name
/// This prevents incomplete records from being saved to the database
pub fn ensure_required_fields(table: &str, mut data: Value) -> Value {
  if let Some(obj) = data.as_object_mut() {
    // Add _id (ObjectId) if missing
    if !obj.contains_key("_id") {
      obj.insert("_id".to_string(), generate_object_id());
    }

    // Add id (UUID) if missing
    if !obj.contains_key("id") {
      obj.insert("id".to_string(), json!(generate_uuid()));
    }

    // Add isDeleted if missing (for tables that support soft delete)
    if !obj.contains_key("isDeleted") {
      obj.insert("isDeleted".to_string(), json!(false));
    }

    // Add timestamps if missing
    if !obj.contains_key("createdAt") {
      let timestamp = getCurrentTimestamp();
      obj.insert("createdAt".to_string(), json!(timestamp));
    }

    if !obj.contains_key("updatedAt") {
      let timestamp = getCurrentTimestamp();
      obj.insert("updatedAt".to_string(), json!(timestamp));
    }

    // Add table-specific required fields with defaults
    add_table_specific_defaults(table, obj);
  }

  data
}

/// Add table-specific default values for required fields
fn add_table_specific_defaults(table: &str, obj: &mut serde_json::Map<String, Value>) {
  match table {
    // ==================== TODOS ====================
    "todos" => {
      if !obj.contains_key("userId") {
        obj.insert("userId".to_string(), json!(""));
      }
      if !obj.contains_key("title") {
        obj.insert("title".to_string(), json!(""));
      }
      if !obj.contains_key("description") {
        obj.insert("description".to_string(), json!(""));
      }
      if !obj.contains_key("startDate") {
        obj.insert("startDate".to_string(), json!(""));
      }
      if !obj.contains_key("endDate") {
        obj.insert("endDate".to_string(), json!(""));
      }
      if !obj.contains_key("categories") {
        obj.insert("categories".to_string(), json!([]));
      }
      if !obj.contains_key("assignees") {
        obj.insert("assignees".to_string(), json!([]));
      }
      if !obj.contains_key("visibility") {
        obj.insert("visibility".to_string(), json!("private"));
      }
      if !obj.contains_key("priority") {
        obj.insert("priority".to_string(), json!("medium"));
      }
      if !obj.contains_key("order") {
        obj.insert("order".to_string(), json!(0));
      }
    }

    // ==================== TASKS ====================
    "tasks" => {
      if !obj.contains_key("todoId") {
        obj.insert("todoId".to_string(), json!(""));
      }
      if !obj.contains_key("title") {
        obj.insert("title".to_string(), json!(""));
      }
      if !obj.contains_key("description") {
        obj.insert("description".to_string(), json!(""));
      }
      if !obj.contains_key("status") {
        obj.insert("status".to_string(), json!("pending"));
      }
      if !obj.contains_key("priority") {
        obj.insert("priority".to_string(), json!("medium"));
      }
      if !obj.contains_key("startDate") {
        obj.insert("startDate".to_string(), json!(""));
      }
      if !obj.contains_key("endDate") {
        obj.insert("endDate".to_string(), json!(""));
      }
      if !obj.contains_key("order") {
        obj.insert("order".to_string(), json!(0));
      }
      if !obj.contains_key("comments") {
        obj.insert("comments".to_string(), json!([]));
      }
      if !obj.contains_key("dependsOn") {
        obj.insert("dependsOn".to_string(), json!([]));
      }
      if !obj.contains_key("repeat") {
        obj.insert("repeat".to_string(), json!("NEVER"));
      }
    }

    // ==================== SUBTASKS ====================
    "subtasks" => {
      if !obj.contains_key("taskId") {
        obj.insert("taskId".to_string(), json!(""));
      }
      if !obj.contains_key("title") {
        obj.insert("title".to_string(), json!(""));
      }
      if !obj.contains_key("description") {
        obj.insert("description".to_string(), json!(""));
      }
      if !obj.contains_key("status") {
        obj.insert("status".to_string(), json!("pending"));
      }
      if !obj.contains_key("priority") {
        obj.insert("priority".to_string(), json!("medium"));
      }
      if !obj.contains_key("order") {
        obj.insert("order".to_string(), json!(0));
      }
      if !obj.contains_key("comments") {
        obj.insert("comments".to_string(), json!([]));
      }
      if !obj.contains_key("startDate") {
        obj.insert("startDate".to_string(), json!(""));
      }
      if !obj.contains_key("endDate") {
        obj.insert("endDate".to_string(), json!(""));
      }
    }

    // ==================== CATEGORIES ====================
    "categories" => {
      if !obj.contains_key("userId") {
        obj.insert("userId".to_string(), json!(""));
      }
      if !obj.contains_key("title") {
        obj.insert("title".to_string(), json!(""));
      }
    }

    // ==================== COMMENTS ====================
    "comments" => {
      if !obj.contains_key("content") {
        obj.insert("content".to_string(), json!(""));
      }
      if !obj.contains_key("authorId") {
        obj.insert("authorId".to_string(), json!(""));
      }
      if !obj.contains_key("readBy") {
        obj.insert("readBy".to_string(), json!([]));
      }
      // Comments can belong to either a task or subtask
      if !obj.contains_key("taskId") {
        obj.insert("taskId".to_string(), json!(null));
      }
      if !obj.contains_key("subtaskId") {
        obj.insert("subtaskId".to_string(), json!(null));
      }
    }

    // ==================== CHATS ====================
    "chats" => {
      if !obj.contains_key("todoId") {
        obj.insert("todoId".to_string(), json!(""));
      }
      if !obj.contains_key("messages") {
        obj.insert("messages".to_string(), json!([]));
      }
    }

    // ==================== PROFILES ====================
    "profiles" => {
      if !obj.contains_key("userId") {
        obj.insert("userId".to_string(), json!(""));
      }
      if !obj.contains_key("name") {
        obj.insert("name".to_string(), json!(""));
      }
      if !obj.contains_key("lastName") {
        obj.insert("lastName".to_string(), json!(""));
      }
      if !obj.contains_key("avatar") {
        obj.insert("avatar".to_string(), json!(""));
      }
      if !obj.contains_key("bio") {
        obj.insert("bio".to_string(), json!(""));
      }
    }

    // ==================== USERS ====================
    "users" => {
      if !obj.contains_key("email") {
        obj.insert("email".to_string(), json!(""));
      }
      if !obj.contains_key("password") {
        obj.insert("password".to_string(), json!(""));
      }
      if !obj.contains_key("role") {
        obj.insert("role".to_string(), json!("user"));
      }
    }

    // Default case - no table-specific defaults
    _ => {}
  }
}

/// Generate a MongoDB-style ObjectId (24 hex chars)
fn generate_object_id() -> Value {
  let timestamp = format!(
    "{:08x}",
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_secs() as u32
  );

  // Use UUID v4 for the random 16-char portion
  let uuid_hex = Uuid::new_v4().to_string().replace("-", "");
  let random_part = &uuid_hex[..16];

  json!({ "$oid": format!("{}{}", timestamp, random_part) })
}

/// Generate a UUID v4
fn generate_uuid() -> String {
  Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_ensure_required_fields_adds_missing_fields() {
    let data = json!({
      "userId": "test-user",
      "title": "Test Todo"
    });

    let result = ensure_required_fields("todos", data);
    let obj = result.as_object().unwrap();

    assert!(obj.contains_key("_id"));
    assert!(obj.contains_key("id"));
    assert!(obj.contains_key("isDeleted"));
    assert!(obj.contains_key("createdAt"));
    assert!(obj.contains_key("updatedAt"));
    assert!(obj.contains_key("visibility"));
    assert!(obj.contains_key("priority"));
  }

  #[test]
  fn test_ensure_required_fields_preserves_existing() {
    let data = json!({
      "_id": { "$oid": "existing-id" },
      "id": "existing-uuid",
      "title": "Test"
    });

    let result = ensure_required_fields("todos", data);
    let obj = result.as_object().unwrap();

    // Should preserve existing _id and id
    assert_eq!(obj["_id"]["$oid"], "existing-id");
    assert_eq!(obj["id"], "existing-uuid");
  }
}
