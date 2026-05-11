use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::permission_service::PermissionService;
use serde_json::{json, Value};

pub struct CategoryService {
  provider: DataProvider,
  #[allow(dead_code)]
  permission_service: PermissionService,
}

impl CategoryService {
  pub fn new(provider: DataProvider, permission_service: PermissionService) -> Self {
    Self {
      provider,
      permission_service,
    }
  }

  pub async fn get_by_id(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .provider
      .find_by_id("categories", id)
      .await?
      .ok_or_else(|| err_response("Category not found"))?;

    if !PermissionService::can_view_category(&doc, user_id) {
      return Err(err_response(
        "Unauthorized: You do not have permission to view this category",
      ));
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
    let permission_filter =
      PermissionService::get_category_filter_for_user(user_id, Some(visibility));

    let final_filter = if let Some(f) = filter {
      let combined = json!({
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

    let docs = self
      .provider
      .find_many("categories", final_filter.as_ref(), skip, limit, None, true)
      .await?;
    Ok(success_response(DataValue::Array(docs)))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self.provider.insert("categories", data).await?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self.provider.update("categories", id, data).await?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .provider
      .update(
        "categories",
        id,
        json!({ "deleted_at": chrono::Utc::now().to_rfc3339() }),
      )
      .await?;
    Ok(success_response(DataValue::Object(doc)))
  }
}
