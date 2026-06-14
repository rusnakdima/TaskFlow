use crate::entities::response_entity::ResponseModel;
use crate::helpers::cascade_helper::soft_delete_cascade_all;
use crate::helpers::response_helper::{err_response, success_response};
use crate::helpers::visibility_helper::get_visibility;
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::BaseCrudService;
use serde_json::{json, Value};

#[allow(dead_code)]
pub struct CommentService {
  base: BaseCrudService,
}

#[allow(dead_code)]
impl CommentService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      base: BaseCrudService::new(json_provider, mongo_provider),
    }
  }

  pub async fn get_by_id(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("comments", id)
      .await?
      .ok_or_else(|| err_response("Comment not found"))?;
    Ok(success_response(doc))
  }

  pub async fn get_all(
    &self,
    visibility: &str,
    filter: Option<Value>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.base.get_provider(visibility)?;

    let filter_opt = if let Some(f) = filter {
      Some(
        nosql_orm::query::Filter::from_json(&f)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      )
    } else {
      None
    };

    let docs = provider
      .find_many("comments", filter_opt.as_ref(), skip, limit, None, true)
      .await?;
    Ok(success_response(docs))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .insert("comments", data)
      .await?;
    Ok(success_response(doc))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .patch("comments", id, data)
      .await?;
    Ok(success_response(doc))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
      .find_by_id("comments", id)
      .await?
      .ok_or_else(|| err_response("Comment not found"))?;

    let visibility = get_visibility(&existing);
    let provider = self.base.get_provider(visibility)?;

    let _ = soft_delete_cascade_all(&provider, "comments", id).await;
    Ok(success_response(json!({})))
  }
}
