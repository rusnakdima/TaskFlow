use crate::entities::response_entity::ResponseModel;
use crate::helpers::collection_metadata::add_collection_metadata;
use crate::helpers::load_param::parse_load_param;
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::relations::RelationLoader;
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

  #[allow(dead_code)]
  async fn insert_to_mongo(&self, data: Value) -> Result<Value, ResponseModel> {
    if let Some(mongo) = self.get_mongo_provider() {
      let doc = mongo.insert("rooms", data).await?;
      Ok(doc)
    } else {
      Err(err_response("MongoDB provider not available"))
    }
  }

  #[allow(dead_code)]
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
    Ok(success_response(doc))
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
      return Ok(success_response(doc.clone()));
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
        return Ok(success_response(doc.clone()));
      }
    }

    Ok(success_response(serde_json::Value::Null))
  }

  pub async fn get_all(
    &self,
    _visibility: &str,
    filter: Option<Value>,
    skip: Option<u64>,
    limit: Option<u64>,
    load: Option<String>,
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

    let load_paths = parse_load_param(load);
    if !load_paths.is_empty() && !all_docs.is_empty() {
      if let Some(DataProvider::Mongo(mongo_arc)) = self.get_mongo_provider() {
        let loader = RelationLoader::new(mongo_arc.as_ref().clone());
        let docs_with_meta = add_collection_metadata(all_docs.clone(), "rooms");
        let segments: Vec<&str> = load_paths.iter().map(|s| s.as_str()).collect();
        match loader
          .load_relations_on_docs(docs_with_meta, "rooms", &segments, true)
          .await
        {
          Ok(loaded) => {
            all_docs = loaded;
          }
          Err(e) => {
            let _ = e;
          }
        }
      }
    }

    Ok(success_response(all_docs))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut create_data = data;
    create_data["created_at"] = serde_json::json!(now);
    create_data["updated_at"] = serde_json::json!(now);
    let doc = mongo.insert("rooms", create_data).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.insert("rooms", doc.clone()).await;
    }
    Ok(success_response(doc))
  }

  pub async fn update(&self, room_id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut update_data = data;
    update_data["updated_at"] = serde_json::json!(now);
    let doc = mongo.patch("rooms", room_id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("rooms", room_id, update_data).await;
    }
    Ok(success_response(doc))
  }

  pub async fn add_participants(
    &self,
    room_id: &str,
    new_participant_ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let existing = mongo
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

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "participant_ids": participant_ids.clone(), "updated_at": now });
    let doc = mongo.patch("rooms", room_id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("rooms", room_id, update_data).await;
    }
    Ok(success_response(doc))
  }

  pub async fn find_or_create_dm_room(
    &self,
    room_id: &str,
    sender_id: &str,
    receiver_id: &str,
    dm_name: &str,
  ) -> Result<Value, ResponseModel> {
    let filter = json!({ "room": room_id });
    let filter_obj = nosql_orm::query::Filter::from_json(&filter)
      .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

    // Check MongoDB first
    if let Some(mongo) = self.get_mongo_provider() {
      let existing = mongo
        .find_many("rooms", Some(&filter_obj), None, Some(1), None, true)
        .await?;

      if let Some(room) = existing.into_iter().next() {
        return Ok(room); // Room already exists
      }

      // Room doesn't exist - create it with both participants
      let now = chrono::Utc::now().to_rfc3339();
      let room_data = json!({
        "room": room_id,
        "name": dm_name,
        "is_group": false,
        "participant_ids": [sender_id, receiver_id],
        "created_at": now,
        "updated_at": now
      });

      let doc = mongo.insert("rooms", room_data.clone()).await?;

      // Sync to JSON provider
      let json_provider = self.base.get_json_provider();
      if let DataProvider::Json(p) = json_provider {
        let _ = p.insert("rooms", doc.clone()).await;
      }

      return Ok(doc);
    }

    Err(err_response("MongoDB not available"))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    // Find by room field, not id
    let filter = json!({ "room": id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );
    let docs = mongo
      .find_many("rooms", filter_opt.as_ref(), None, Some(1), None, true)
      .await?;
    let existing = docs
      .first()
      .cloned()
      .ok_or_else(|| err_response("Room not found"))?;
    let doc_id = existing.get("id").and_then(|v| v.as_str()).unwrap_or(id);

    // Cascade: delete all chats in this room from MongoDB
    let chat_filter = json!({ "room_id": id });
    if let Ok(chat_filter_obj) = nosql_orm::query::Filter::from_json(&chat_filter) {
      let chat_docs: Vec<serde_json::Value> = mongo
        .find_many("chats", Some(&chat_filter_obj), None, None, None, true)
        .await
        .unwrap_or_default();
      for chat_doc in chat_docs {
        if let Some(chat_id) = chat_doc.get("id").and_then(|v| v.as_str()) {
          let _ = mongo.delete("chats", chat_id).await;
        }
      }
    }

    // Delete from JSON cascade
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let chat_filter = json!({ "room_id": id });
      if let Ok(chat_filter_obj) = nosql_orm::query::Filter::from_json(&chat_filter) {
        let json_chat_docs: Vec<serde_json::Value> = DatabaseProvider::find_many(
          p.as_ref(),
          "chats",
          Some(&chat_filter_obj),
          None,
          None,
          None,
          true,
        )
        .await
        .unwrap_or_default();
        for chat_doc in json_chat_docs {
          if let Some(chat_id) = chat_doc.get("id").and_then(|v| v.as_str()) {
            let _ = p.delete("chats", chat_id).await;
          }
        }
      }
      let _ = p.delete("rooms", doc_id).await;
    }

    // Delete the room from MongoDB
    let _ = mongo.delete("rooms", doc_id).await;

    Ok(success_response(json!({})))
  }
}
