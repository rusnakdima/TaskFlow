use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::permission_service::PermissionService;
use serde_json::{json, Value};

pub struct TaskService {
  json_provider: DataProvider,
  mongo_provider: Option<DataProvider>,
}

impl TaskService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      json_provider,
      mongo_provider,
    }
  }

  fn get_provider(&self, visibility: &str) -> Result<DataProvider, ResponseModel> {
    let offline = std::env::var("OFFLINE_MODE").unwrap_or_default() == "true";
    let use_json = visibility == "private" || offline || visibility == "all";

    if use_json {
      Ok(self.json_provider.clone())
    } else {
      match self.mongo_provider.clone() {
        Some(p) => Ok(p),
        None => Err(err_response(
          "MongoDB not available - cannot access shared/team records.",
        )),
      }
    }
  }

  pub async fn get_by_id(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .json_provider
      .find_by_id("tasks", id)
      .await?
      .ok_or_else(|| err_response("Task not found"))?;

    let todo_id = doc.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");

    let visibility = doc
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");

    if !todo_id.is_empty() {
      if let Some(todo) = self
        .get_provider(visibility)?
        .find_by_id("todos", todo_id)
        .await?
      {
        if !PermissionService::can_view_todo(&todo, user_id) {
          return Err(err_response(
            "Unauthorized: You do not have permission to view this task",
          ));
        }
      }
    }

    Ok(success_response(DataValue::Object(doc)))
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

    let todos_filter = PermissionService::get_todo_filter_for_user(user_id, Some(visibility));

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
      return Ok(success_response(DataValue::Array(vec![])));
    }

    let mut task_filter = json!({
      "todo_id": { "$in": todo_ids }
    });

    if let Some(f) = filter {
      task_filter = json!({
        "$and": [task_filter, f]
      });
    }

    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&task_filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let docs = provider
      .find_many("tasks", filter_opt.as_ref(), skip, limit, None, true)
      .await?;

    Ok(success_response(DataValue::Array(docs)))
  }

  pub async fn create(
    &self,
    data: Value,
    visibility: &str,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;

    let todo_id = data.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");

    if !todo_id.is_empty() {
      if let Some(todo) = provider.find_by_id("todos", todo_id).await? {
        if !PermissionService::can_add_task_to_todo(&todo, user_id) {
          return Err(err_response(
            "Unauthorized: You do not have permission to add tasks to this todo",
          ));
        }
      }
    }

    let doc = provider.insert("tasks", data).await?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(
    &self,
    id: &str,
    data: Value,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .json_provider
      .find_by_id("tasks", id)
      .await?
      .ok_or_else(|| err_response("Task not found"))?;

    let visibility = existing
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");

    let provider = self.get_provider(visibility)?;

    let todo_id = existing
      .get("todo_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if !todo_id.is_empty() {
      if let Some(todo) = provider.find_by_id("todos", todo_id).await? {
        if !PermissionService::can_edit_task(&existing, &todo, user_id) {
          return Err(err_response(
            "Unauthorized: You do not have permission to edit this task",
          ));
        }
      }
    }

    let doc = provider.patch("tasks", id, data).await?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .json_provider
      .find_by_id("tasks", id)
      .await?
      .ok_or_else(|| err_response("Task not found"))?;

    let visibility = existing
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("private");

    let provider = self.get_provider(visibility)?;

    let todo_id = existing
      .get("todo_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if !todo_id.is_empty() {
      if let Some(todo) = provider.find_by_id("todos", todo_id).await? {
        if !PermissionService::can_delete_task(&existing, &todo, user_id) {
          return Err(err_response(
            "Unauthorized: You do not have permission to delete this task",
          ));
        }
      }
    }

    let doc = provider
      .update(
        "tasks",
        id,
        json!({ "deleted_at": chrono::Utc::now().to_rfc3339() }),
      )
      .await?;
    Ok(success_response(DataValue::Object(doc)))
  }
}
