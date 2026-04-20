use chrono::{DateTime, NaiveDate};
use serde_json::Value;
use std::collections::HashMap;

pub struct CategoryStatistics;

impl CategoryStatistics {
  pub fn calculateCategoryTasks(
    categories: &Vec<Value>,
    todos: &Vec<Value>,
    tasks: &Vec<Value>,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
  ) -> Vec<Value> {
    let mut categoriesWithCounts = Vec::new();

    // Group tasks by todoId for efficient lookup
    let mut tasksByTodo: HashMap<String, Vec<Value>> = HashMap::new();
    for task in tasks {
      if let Some(todoId) = task.get("todo_id").and_then(|v| v.as_str()) {
        tasksByTodo
          .entry(todoId.to_string())
          .or_default()
          .push(task.clone());
      }
    }

    for category in categories {
      let mut categoryClone = category.clone();
      let mut categoryTodos = Vec::new();
      let mut categoryTaskCount = 0;
      let mut categoryCompletedTaskCount = 0;

      let categoryId = category.get("id").and_then(|v| v.as_str()).unwrap_or("");

      for todo in todos {
        let mut hasCategory = false;
        if let Some(todoCategories) = todo.get("categories").and_then(|v| v.as_array()) {
          hasCategory = todoCategories.iter().any(|cat| {
            if let Some(catId) = cat.get("id").and_then(|v| v.as_str()) {
              return catId == categoryId;
            }
            if let Some(catId) = cat.as_str() {
              return catId == categoryId;
            }
            false
          });
        }

        if hasCategory {
          let mut todoHasRelevantTasks = false;
          let todoId = todo.get("id").and_then(|v| v.as_str()).unwrap_or("");

          if let Some(todoTasks) = tasksByTodo.get(todoId) {
            for task in todoTasks {
              let mut isTaskInRange = false;
              if let Some(createdAtStr) = task.get("created_at").and_then(|v| v.as_str()) {
                if let Ok(dt) = DateTime::parse_from_rfc3339(createdAtStr) {
                  let date = dt.date_naive();
                  if date >= *startDate && date <= *endDate {
                    isTaskInRange = true;
                  }
                }
              }

              if !isTaskInRange {
                if let Some(updatedAtStr) = task.get("updated_at").and_then(|v| v.as_str()) {
                  if let Ok(dt) = DateTime::parse_from_rfc3339(updatedAtStr) {
                    let date = dt.date_naive();
                    if date >= *startDate && date <= *endDate {
                      isTaskInRange = true;
                    }
                  }
                }
              }

              if isTaskInRange {
                categoryTaskCount += 1;
                todoHasRelevantTasks = true;
                if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
                  if status == "completed" || status == "skipped" {
                    categoryCompletedTaskCount += 1;
                  }
                }
              }
            }
          }

          if todoHasRelevantTasks {
            categoryTodos.push(todo.clone());
          }
        }
      }

      if let Some(obj) = categoryClone.as_object_mut() {
        obj.insert("todos".to_string(), serde_json::Value::Array(categoryTodos));
        obj.insert(
          "taskCount".to_string(),
          serde_json::Value::Number(categoryTaskCount.into()),
        );
        obj.insert(
          "completedTaskCount".to_string(),
          serde_json::Value::Number(categoryCompletedTaskCount.into()),
        );
      }
      categoriesWithCounts.push(categoryClone);
    }

    categoriesWithCounts
  }
}
