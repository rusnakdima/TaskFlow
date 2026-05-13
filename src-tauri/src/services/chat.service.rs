use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use serde_json::{json, Value};

pub struct ChatService {
  json_provider: DataProvider,
  mongo_provider: Option<DataProvider>,
}

impl ChatService {
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
        None => Err(err_response("MongoDB not available")),
      }
    }
  }

  pub async fn get_by_id(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .json_provider
      .find_by_id("chats", id)
      .await?
      .ok_or_else(|| err_response("Chat not found"))?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn get_all(
    &self,
    visibility: &str,
    filter: Option<Value>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(visibility)?;

    let filter_opt = if let Some(f) = filter {
      Some(
        nosql_orm::query::Filter::from_json(&f)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      )
    } else {
      None
    };

    let docs = provider
      .find_many("chats", filter_opt.as_ref(), skip, limit, None, true)
      .await?;
    Ok(success_response(DataValue::Array(docs)))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self.json_provider.insert("chats", data).await?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self.json_provider.update("chats", id, data).await?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .json_provider
      .update(
        "chats",
        id,
        json!({ "deleted_at": chrono::Utc::now().to_rfc3339() }),
      )
      .await?;
    Ok(success_response(DataValue::Object(doc)))
  }
}
