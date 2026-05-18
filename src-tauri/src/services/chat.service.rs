use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::helpers::visibility_helper::get_visibility;
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
use serde_json::{json, Value};

pub struct ChatService {
  base: BaseCrudService,
}

impl ChatService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      base: BaseCrudService::new(json_provider, mongo_provider),
    }
  }

  pub async fn get_by_id(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("chats", id)
      .await?
      .ok_or_else(|| err_response("Chat not found"))?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn get_by_room(
    &self,
    room_id: &str,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "room_id": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let docs = self
      .base
      .get_json_provider()
      .find_many(
        "chats",
        filter_opt.as_ref(),
        skip,
        limit,
        Some("created_at"),
        true,
      )
      .await?;
    Ok(success_response(DataValue::Array(docs)))
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
      .find_many("chats", filter_opt.as_ref(), skip, limit, None, true)
      .await?;
    Ok(success_response(DataValue::Array(docs)))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .base
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut create_data = data;
    create_data["created_at"] = serde_json::json!(now);
    create_data["updated_at"] = serde_json::json!(now);
    let doc: Value = mongo.insert("chats", create_data).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.insert("chats", doc.clone()).await;
    }
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .base
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut update_data = data;
    update_data["updated_at"] = serde_json::json!(now);
    let doc: Value = mongo.patch("chats", id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", id, update_data).await;
    }
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn mark_read(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .base
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let existing: Value = mongo
      .find_by_id("chats", id)
      .await?
      .ok_or_else(|| err_response("Chat not found"))?;

    let mut read_by: Vec<String> = existing
      .get("read_by")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default();

    if !read_by.contains(&user_id.to_string()) {
      read_by.push(user_id.to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "read_by": read_by, "updated_at": now });
    let doc: Value = mongo.patch("chats", id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", id, update_data).await;
    }
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .base
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let existing: Value = mongo
      .find_by_id("chats", id)
      .await?
      .ok_or_else(|| err_response("Chat not found"))?;
    let visibility = get_visibility(&existing);

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "deleted_at": now, "updated_at": now });
    let doc: Value = mongo.patch("chats", id, update_data.clone()).await?;

    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete("chats", id).await;
      let _ = p.patch("chats", id, update_data).await;
    }

    Ok(success_response(DataValue::Object(json!({}))))
  }

  pub async fn delete_by_room(&self, room_id: &str) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "room_id": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let mongo = self
      .base
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "deleted_at": now, "updated_at": now });

    let docs: Vec<serde_json::Value> = mongo
      .find_many("chats", filter_opt.as_ref(), None, None, None, true)
      .await
      .unwrap_or_default();
    for doc in docs {
      if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
        let _ = mongo.patch("chats", id, update_data.clone()).await;
      }
    }

    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let docs: Vec<serde_json::Value> = DatabaseProvider::find_many(
        p.as_ref(),
        "chats",
        filter_opt.as_ref(),
        None,
        None,
        None,
        true,
      )
      .await
      .unwrap_or_default();
      for doc in docs {
        if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
          let _ = cascade.soft_delete("chats", id).await;
          let _ = p.patch("chats", id, update_data.clone()).await;
        }
      }
    }

    Ok(success_response(DataValue::Object(
      json!({ "room_id": room_id, "deleted": true }),
    )))
  }
}
