use chrono::{DateTime, NaiveDate};
use serde_json::Value;
use std::collections::HashMap;

pub struct CategoryStatistics;

impl CategoryStatistics {
  pub fn calculate_category_tasks(
    categories: &[Value],
    todos: &[Value],
    tasks: &[Value],
    start_date: &NaiveDate,
    end_date: &NaiveDate,
  ) -> Vec<Value> {
    let mut categories_with_counts = Vec::new();

    let mut tasks_by_todo: HashMap<String, Vec<Value>> = HashMap::new();
    for task in tasks {
      if let Some(todo_id) = task.get("todo_id").and_then(|v| v.as_str()) {
        tasks_by_todo
          .entry(todo_id.to_string())
          .or_default()
          .push(task.clone());
      }
    }

    for category in categories {
      let mut category_clone = category.clone();
      let mut category_todos = Vec::new();
      let mut category_task_count = 0;
      let mut category_completed_task_count = 0;

      let category_id = category.get("id").and_then(|v| v.as_str()).unwrap_or("");

      for todo in todos {
        let mut has_category = false;
        if let Some(todo_categories) = todo.get("categories").and_then(|v| v.as_array()) {
          has_category = todo_categories.iter().any(|cat| {
            if let Some(cat_id) = cat.get("id").and_then(|v| v.as_str()) {
              return cat_id == category_id;
            }
            if let Some(cat_id) = cat.as_str() {
              return cat_id == category_id;
            }
            false
          });
        }

        if has_category {
          let mut todo_has_relevant_tasks = false;
          let todo_id = todo.get("id").and_then(|v| v.as_str()).unwrap_or("");

          if let Some(todo_tasks) = tasks_by_todo.get(todo_id) {
            for task in todo_tasks {
              let mut is_task_in_range = false;
              if let Some(created_at_str) = task.get("created_at").and_then(|v| v.as_str()) {
                if let Ok(dt) = DateTime::parse_from_rfc3339(created_at_str) {
                  let date = dt.date_naive();
                  if date >= *start_date && date <= *end_date {
                    is_task_in_range = true;
                  }
                }
              }

              if !is_task_in_range {
                if let Some(updated_at_str) = task.get("updated_at").and_then(|v| v.as_str()) {
                  if let Ok(dt) = DateTime::parse_from_rfc3339(updated_at_str) {
                    let date = dt.date_naive();
                    if date >= *start_date && date <= *end_date {
                      is_task_in_range = true;
                    }
                  }
                }
              }

              if is_task_in_range {
                category_task_count += 1;
                todo_has_relevant_tasks = true;
                if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
                  if status == "completed" || status == "skipped" {
                    category_completed_task_count += 1;
                  }
                }
              }
            }
          }

          if todo_has_relevant_tasks {
            category_todos.push(todo.clone());
          }
        }
      }

      if let Some(obj) = category_clone.as_object_mut() {
        obj.insert(
          "todos".to_string(),
          serde_json::Value::Array(category_todos),
        );
        obj.insert(
          "task_count".to_string(),
          serde_json::Value::Number(category_task_count.into()),
        );
        obj.insert(
          "completed_task_count".to_string(),
          serde_json::Value::Number(category_completed_task_count.into()),
        );
      }
      categories_with_counts.push(category_clone);
    }

    categories_with_counts
  }
}
