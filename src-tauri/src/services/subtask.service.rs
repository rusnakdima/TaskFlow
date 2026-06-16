use crate::entities::response_entity::ResponseModel;
use crate::helpers::cascade::soft_delete_cascade_all;
use crate::helpers::response_helper::{err_response, success_response};
use crate::helpers::visibility::get_visibility;
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::BaseCrudService;
use crate::services::permission_service::PermissionService;
use serde_json::{json, Value};

pub struct SubtaskService {
  base: BaseCrudService,
}

impl SubtaskService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      base: BaseCrudService::new(json_provider, mongo_provider),
    }
  }

  fn get_provider(&self, visibility: &str) -> Result<DataProvider, ResponseModel> {
    self.base.get_provider(visibility)
  }

  pub async fn get_by_id(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("subtasks", id)
      .await?
      .ok_or_else(|| err_response("Subtask not found"))?;

    let task_id = doc.get("task_id").and_then(|v| v.as_str()).unwrap_or("");
    let visibility = get_visibility(&doc);

    if !task_id.is_empty() {
      if let Some(task) = self
        .get_provider(visibility)?
        .find_by_id("tasks", task_id)
        .await?
      {
        let todo_id = task.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");
        if !todo_id.is_empty() {
          if let Some(todo) = self
            .get_provider(visibility)?
            .find_by_id("todos", todo_id)
            .await?
          {
            if !PermissionService::can_view_todo(&todo, user_id) {
              return Err(err_response(
                "Unauthorized: You do not have permission to view this subtask",
              ));
            }
          }
        }
      }
    }

    Ok(success_response(doc))
  }

  pub async fn get_all(
    &self,
    user_id: &str,
    visibility: &str,
    filter: Option<Value>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;

    let todos_filter = PermissionService::get_todo_filter_for_user(user_id, None, Some(visibility));

    let todos = provider
      .find_many(
        "todos",
        Some(
          &nosql_orm::query::Filter::from_json(&todos_filter)
            .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
        ),
        None,
        None,
        None,
        true,
      )
      .await?;

    let todo_ids: Vec<String> = todos
      .iter()
      .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
      .collect();

    if todo_ids.is_empty() {
      return Ok(success_response(serde_json::Value::Array(vec![])));
    }

    let tasks_filter = json!({
      "todo_id": { "$in": todo_ids }
    });

    let tasks = provider
      .find_many(
        "tasks",
        Some(
          &nosql_orm::query::Filter::from_json(&tasks_filter)
            .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
        ),
        None,
        None,
        None,
        true,
      )
      .await?;

    let task_ids: Vec<String> = tasks
      .iter()
      .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
      .collect();

    if task_ids.is_empty() {
      return Ok(success_response(serde_json::Value::Array(vec![])));
    }

    let mut subtask_filter = json!({
      "task_id": { "$in": task_ids }
    });

    if let Some(f) = filter {
      subtask_filter = json!({
        "$and": [subtask_filter, f]
      });
    }

    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&subtask_filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let docs = provider
      .find_many("subtasks", filter_opt.as_ref(), skip, limit, None, true)
      .await?;

    Ok(success_response(docs))
  }

  pub async fn create(
    &self,
    data: Value,
    visibility: &str,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;

    let task_id = data.get("task_id").and_then(|v| v.as_str()).unwrap_or("");

    if !task_id.is_empty() {
      if let Some(task) = provider.find_by_id("tasks", task_id).await? {
        let todo_id = task.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");
        if !todo_id.is_empty() {
          if let Some(todo) = provider.find_by_id("todos", todo_id).await? {
            if !PermissionService::can_add_task_to_todo(&todo, user_id) {
              return Err(err_response(
                "Unauthorized: You do not have permission to add subtasks to this todo",
              ));
            }
          }
        }
      }
    }

    let doc = provider.insert("subtasks", data).await?;
    Ok(success_response(doc))
  }

  pub async fn update(
    &self,
    id: &str,
    data: Value,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
      .find_by_id("subtasks", id)
      .await?
      .ok_or_else(|| err_response("Subtask not found"))?;

    let visibility = get_visibility(&existing);

    let provider = self.get_provider(visibility)?;

    let task_id = existing
      .get("task_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if !task_id.is_empty() {
      if let Some(task) = provider.find_by_id("tasks", task_id).await? {
        let todo_id = task.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");
        if !todo_id.is_empty() {
          if let Some(todo) = provider.find_by_id("todos", todo_id).await? {
            if !PermissionService::can_edit_subtask(&existing, &task, &todo, user_id) {
              return Err(err_response(
                "Unauthorized: You do not have permission to edit this subtask",
              ));
            }
          }
        }
      }
    }

    let doc = provider.patch("subtasks", id, data).await?;
    Ok(success_response(doc))
  }

  pub async fn delete(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
      .find_by_id("subtasks", id)
      .await?
      .ok_or_else(|| err_response("Subtask not found"))?;

    let visibility = get_visibility(&existing);

    let provider = self.get_provider(visibility)?;

    let task_id = existing
      .get("task_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if !task_id.is_empty() {
      if let Some(task) = provider.find_by_id("tasks", task_id).await? {
        let todo_id = task.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");
        if !todo_id.is_empty() {
          if let Some(todo) = provider.find_by_id("todos", todo_id).await? {
            if !PermissionService::can_delete_subtask(&existing, &task, &todo, user_id) {
              return Err(err_response(
                "Unauthorized: You do not have permission to delete this subtask",
              ));
            }
          }
        }
      }
    }

    let _ = soft_delete_cascade_all(&provider, "subtasks", id).await;
    Ok(success_response(json!({})))
  }
}
