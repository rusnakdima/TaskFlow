/* sys lib */
use serde_json::{json, Value};
/* nosql_orm */
use nosql_orm::providers::{JsonProvider, MongoProvider};
use std::sync::Arc;
/* providers */
use crate::repositories::data_provider::DataProvider;
/* entities */
use crate::models::response::Response;
use crate::models::response::ResponseModel;
/* helpers */

pub struct NotificationService {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}
impl NotificationService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }
  fn get_provider(&self, visibility: &str) -> Result<DataProvider, ResponseModel> {
    if visibility == "private" {
      Ok(DataProvider::Json(Arc::new(self.json_provider.clone())))
    } else {
      match self.mongodb_provider.as_ref() {
        Some(p) => Ok(DataProvider::Mongo(p.clone())),
        None => Err(Response::error("MongoDB not available")),
      }
    }
  }
  pub async fn create(
    &self,
    data: Value,
    visibility: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;
    let doc = provider.insert("notifications", data).await?;
    Ok(Response::success(doc, Some("Operation successful")))
  }
  pub async fn get_by_user(
    &self,
    user_id: &str,
    visibility: &str,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;
    let filter = nosql_orm::query::Filter::Eq("user_id".to_string(), json!(user_id));
    let docs = provider
      .find_many("notifications", Some(&filter), skip, limit, None, true)
      .await?;
    Ok(Response::success(
      serde_json::json!(docs),
      Some("Operation successful"),
    ))
  }
  pub async fn mark_as_read(
    &self,
    id: &str,
    visibility: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;
    let update = json!({ "read": true });
    let doc = provider.patch("notifications", id, update).await?;
    Ok(Response::success(doc, Some("Operation successful")))
  }
  pub async fn mark_all_as_read(
    &self,
    user_id: &str,
    visibility: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;
    let filter = nosql_orm::query::Filter::Eq("user_id".to_string(), json!(user_id));
    let docs = provider
      .find_many("notifications", Some(&filter), None, None, None, true)
      .await?;
    for doc in docs {
      if let Some(id) = doc.get("id").and_then(|v: &serde_json::Value| v.as_str()) {
        if doc
          .get("read")
          .and_then(|v: &serde_json::Value| v.as_bool())
          != Some(true)
        {
          let _ = provider
            .patch("notifications", id, json!({ "read": true }))
            .await;
        }
      }
    }
    Ok(Response::success(
      serde_json::Value::Array(vec![]),
      Some("Operation successful"),
    ))
  }
  pub async fn delete(&self, id: &str, visibility: &str) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;
    let _ = provider.delete("notifications", id).await;
    Ok(Response::success(
      serde_json::json!(id.to_string()),
      Some("Operation successful"),
    ))
  }
  pub async fn clear_all(
    &self,
    user_id: &str,
    visibility: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;
    let filter = nosql_orm::query::Filter::Eq("user_id".to_string(), json!(user_id));
    let docs = provider
      .find_many("notifications", Some(&filter), None, None, None, true)
      .await?;
    for doc in docs {
      if let Some(id) = doc.get("id").and_then(|v: &serde_json::Value| v.as_str()) {
        let _ = provider.delete("notifications", id).await;
      }
    }
    Ok(Response::success(
      serde_json::Value::Array(vec![]),
      Some("Operation successful"),
    ))
  }
}
