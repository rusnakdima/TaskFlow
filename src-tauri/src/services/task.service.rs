use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, err_response_formatted, success_response};
use crate::helpers::visibility_helper::get_visibility;
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use crate::services::permission_service::PermissionService;
use nosql_orm::cascade::CascadeManager;
use serde_json::{json, Value};

pub struct TaskService {
  base: BaseCrudService,
}

impl TaskService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      base: BaseCrudService::new(json_provider, mongo_provider),
    }
  }

  pub async fn get_by_id(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("tasks", id)
      .await?
      .ok_or_else(|| err_response("Task not found"))?;

    let todo_id = doc.get("todo_id").and_then(|v| v.as_str()).unwrap_or("");
    let visibility = get_visibility(&doc);

    if !todo_id.is_empty() {
      if let Some(todo) = self
        .base
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
    let provider = self.base.get_provider(visibility)?;

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
    let provider = self.base.get_provider(visibility)?;

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
      .base
      .get_json_provider()
      .find_by_id("tasks", id)
      .await?
      .ok_or_else(|| err_response("Task not found"))?;

    let visibility = get_visibility(&existing);

    let provider = self.base.get_provider(visibility)?;

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
      .base
      .get_json_provider()
      .find_by_id("tasks", id)
      .await?
      .ok_or_else(|| err_response("Task not found"))?;

    let visibility = get_visibility(&existing);

    let provider = self.base.get_provider(visibility)?;

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

    match provider {
      DataProvider::Json(p) => {
        let cascade = CascadeManager::new(p.as_ref().clone());
        cascade
          .soft_delete("tasks", id)
          .await
          .map_err(|e| err_response_formatted("Soft delete failed", &e.to_string()))?;
      }
      DataProvider::Mongo(p) => {
        let cascade = CascadeManager::new(p.as_ref().clone());
        cascade
          .soft_delete("tasks", id)
          .await
          .map_err(|e| err_response_formatted("Soft delete failed", &e.to_string()))?;
      }
    }
    Ok(success_response(DataValue::Object(json!({}))))
  }
}
