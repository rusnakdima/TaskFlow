use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use serde_json::{json, Value};

pub struct RoomService {
  base: BaseCrudService,
}

impl RoomService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      base: BaseCrudService::new(json_provider, mongo_provider),
    }
  }

  pub fn get_json_provider(&self) -> &DataProvider {
    self.base.get_json_provider()
  }

  pub fn get_mongo_provider(&self) -> Option<&DataProvider> {
    self.base.get_mongo_provider()
  }

  async fn insert_to_mongo(&self, data: Value) -> Result<Value, ResponseModel> {
    if let Some(mongo) = self.get_mongo_provider() {
      let doc = mongo.insert("rooms", data).await?;
      Ok(doc)
    } else {
      Err(err_response("MongoDB provider not available"))
    }
  }

  async fn update_in_mongo(&self, room_id: &str, data: Value) -> Result<Value, ResponseModel> {
    if let Some(mongo) = self.get_mongo_provider() {
      let doc = mongo.update("rooms", room_id, data).await?;
      Ok(doc)
    } else {
      Err(err_response("MongoDB provider not available"))
    }
  }

  pub async fn get_by_id(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("rooms", id)
      .await?
      .ok_or_else(|| err_response("Room not found"))?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn get_by_room(&self, room_id: &str) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "room": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let docs = self
      .base
      .get_json_provider()
      .find_many(
        "rooms",
        filter_opt.as_ref(),
        None,
        Some(1),
        Some("created_at"),
        true,
      )
      .await?;

    if let Some(doc) = docs.first() {
      return Ok(success_response(DataValue::Object(doc.clone())));
    }

    if let Some(mongo) = self.get_mongo_provider() {
      let docs = mongo
        .find_many(
          "rooms",
          filter_opt.as_ref(),
          None,
          Some(1),
          Some("created_at"),
          true,
        )
        .await?;
      if let Some(doc) = docs.first() {
        return Ok(success_response(DataValue::Object(doc.clone())));
      }
    }

    Ok(success_response(DataValue::Object(serde_json::Value::Null)))
  }

  pub async fn get_all(
    &self,
    visibility: &str,
    filter: Option<Value>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter_opt = if let Some(f) = filter {
      Some(
        nosql_orm::query::Filter::from_json(&f)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      )
    } else {
      None
    };

    let mut all_docs: Vec<Value> = Vec::new();

    let json_provider = self.base.get_json_provider();
    let json_docs = json_provider
      .find_many(
        "rooms",
        filter_opt.as_ref(),
        skip,
        limit,
        Some("created_at"),
        true,
      )
      .await?;
    all_docs.extend(json_docs);

    if let Some(mongo) = self.get_mongo_provider() {
      let mongo_docs = mongo
        .find_many(
          "rooms",
          filter_opt.as_ref(),
          skip,
          limit,
          Some("created_at"),
          true,
        )
        .await?;
      for doc in mongo_docs {
        if !all_docs
          .iter()
          .any(|d| d.get("id") == doc.get("id") || d.get("room") == doc.get("room"))
        {
          all_docs.push(doc);
        }
      }
    }

    Ok(success_response(DataValue::Array(all_docs)))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .insert("rooms", data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.insert("rooms", data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(&self, room_id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .update("rooms", room_id, data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.update("rooms", room_id, data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn add_participants(
    &self,
    room_id: &str,
    new_participant_ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
      .find_by_id("rooms", room_id)
      .await?
      .ok_or_else(|| err_response("Room not found"))?;

    let mut participant_ids: Vec<String> = existing
      .get("participant_ids")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default();

    for new_id in new_participant_ids {
      if !participant_ids.contains(&new_id) {
        participant_ids.push(new_id);
      }
    }

    let update_data = json!({ "participant_ids": participant_ids.clone() });
    let doc = self
      .base
      .get_json_provider()
      .update("rooms", room_id, update_data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.update("rooms", room_id, update_data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let update_data = json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });

    let doc = self
      .base
      .get_json_provider()
      .update("rooms", id, update_data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.update("rooms", id, update_data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }
}
