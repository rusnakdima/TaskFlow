use crate::entities::response_entity::ResponseModel;
use crate::helpers::cascade_helper::soft_delete_cascade_all;
use crate::helpers::response_helper::{err_response, success_response};
use crate::helpers::visibility_helper::get_visibility;
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use crate::services::permission_service::PermissionService;
use serde_json::{json, Value};

pub struct TodoService {
  base: BaseCrudService,
}

impl TodoService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      base: BaseCrudService::new(json_provider, mongo_provider),
    }
  }

  pub async fn get_by_id(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("todos", id)
      .await?
      .ok_or_else(|| err_response("Todo not found"))?;

    if !PermissionService::can_view_todo(&doc, user_id) {
      return Err(err_response(
        "Unauthorized: You do not have permission to view this todo",
      ));
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
    let provider = self.base.get_provider(visibility)?;
    let permission_filter =
      PermissionService::get_todo_filter_for_user(user_id, None, Some(visibility));

    let final_filter = if let Some(f) = filter {
      let combined = serde_json::json!({
          "$and": [permission_filter, f]
      });
      Some(
        nosql_orm::query::Filter::from_json(&combined)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      )
    } else {
      Some(
        nosql_orm::query::Filter::from_json(&permission_filter)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      )
    };

    let docs = provider
      .find_many("todos", final_filter.as_ref(), skip, limit, None, true)
      .await?;

    Ok(success_response(docs))
  }

  pub async fn create(
    &self,
    data: Value,
    visibility: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.base.get_provider(visibility)?;
    let doc = provider.insert("todos", data).await?;
    Ok(success_response(doc))
  }

  pub async fn update(
    &self,
    id: &str,
    data: Value,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    // First find existing todo to get its stored visibility
    // We must use the STORED visibility, not from request data, to determine the provider
    let existing = self
      .base
      .get_json_provider()
      .find_by_id("todos", id)
      .await?
      .ok_or_else(|| err_response("Todo not found"))?;

    let stored_visibility = get_visibility(&existing);
    let provider = self.base.get_provider(stored_visibility)?;

    if !PermissionService::can_edit_todo(&existing, user_id) {
      return Err(err_response(
        "Unauthorized: You do not have permission to edit this todo",
      ));
    }

    let mut update_data = data;
    // Ensure visibility in data matches stored visibility (don't allow changing via update)
    if let Some(v) = update_data.get_mut("visibility") {
      *v = Value::String(stored_visibility.to_string());
    }

    let doc = provider.patch("todos", id, update_data).await?;
    Ok(success_response(doc))
  }

  pub async fn delete(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
      .find_by_id("todos", id)
      .await?
      .ok_or_else(|| err_response("Todo not found"))?;

    let visibility = get_visibility(&existing);

    let provider = self.base.get_provider(visibility)?;

    if !PermissionService::can_delete_todo(&existing, user_id) {
      return Err(err_response(
        "Unauthorized: You do not have permission to delete this todo",
      ));
    }

    let _ = soft_delete_cascade_all(&provider, "todos", id).await;
    Ok(success_response(json!({})))
  }
}
