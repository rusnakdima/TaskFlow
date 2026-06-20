use serde_json::Value;
pub fn get_relation_fields_for_table(table: &str) -> Vec<&'static str> {
  match table {
    "tasks" => vec!["subtasks", "comments"],
    "subtasks" => vec!["comments"],
    "comments" => vec!["user", "task", "subtask"],
    "todos" => vec!["tasks", "user"],
    "categories" => vec!["user"],
    "users" => vec!["profile"],
    "profiles" => vec!["user"],
    "chats" => vec!["messages"],
    _ => vec![],
  }
}
pub fn strip_relation_fields(docs: Vec<Value>, table: &str) -> Vec<Value> {
  let relation_fields = get_relation_fields_for_table(table);
  if relation_fields.is_empty() {
    return docs;
  }
  docs
    .into_iter()
    .map(|mut doc| {
      if let Some(obj) = doc.as_object_mut() {
        for field in &relation_fields {
          obj.remove(*field);
        }
      }
      doc
    })
    .collect()
}
#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;
  #[test]
  fn test_strip_relation_fields_from_tasks() {
    let task = json!({
        "id": "t1",
        "title": "Test Task",
        "status": "pending",
        "subtasks": [{"id": "s1", "title": "Subtask 1"}],
        "comments": [{"id": "c1", "content": "Comment 1"}]
    });
    let result = strip_relation_fields(vec![task], "tasks");
    assert_eq!(result.len(), 1);
    let doc = &result[0];
    assert!(doc.get("id").is_some());
    assert!(doc.get("title").is_some());
    assert!(doc.get("subtasks").is_none());
    assert!(doc.get("comments").is_none());
  }
  #[test]
  fn test_strip_relation_fields_from_todos() {
    let todo = json!({
        "id": "todo1",
        "title": "Test Todo",
        "user": {"id": "u1", "username": "test"},
        "tasks": [{"id": "t1", "title": "Task"}],
        "categories": [{"id": "cat1", "name": "Category"}]
    });
    let result = strip_relation_fields(vec![todo], "todos");
    let doc = &result[0];
    assert!(doc.get("id").is_some());
    assert!(doc.get("user").is_none());
    assert!(doc.get("tasks").is_none());
    assert!(doc.get("categories").is_none());
  }
  #[test]
  fn test_strip_relation_fields_no_relations() {
    let task = json!({
        "id": "t1",
        "title": "Test Task",
        "status": "pending"
    });
    let result = strip_relation_fields(vec![task], "tasks");
    assert_eq!(result.len(), 1);
    assert!(result[0].get("id").is_some());
    assert!(result[0].get("title").is_some());
  }
  #[test]
  fn test_strip_relation_fields_empty_vec() {
    let docs: Vec<Value> = vec![];
    let result = strip_relation_fields(docs, "tasks");
    assert!(result.is_empty());
  }
}
