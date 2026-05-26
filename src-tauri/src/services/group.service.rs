use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use nosql_orm::provider::DatabaseProvider;
use serde_json::{json, Value};

pub struct GroupService {
  base: BaseCrudService,
}

impl GroupService {
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

  async fn insert_to_mongo(&self, table: &str, data: Value) -> Result<Value, ResponseModel> {
    if let Some(mongo) = self.get_mongo_provider() {
      let doc = mongo.insert(table, data).await?;
      Ok(doc)
    } else {
      Err(err_response("MongoDB provider not available"))
    }
  }

  async fn update_in_mongo(
    &self,
    table: &str,
    id: &str,
    data: Value,
  ) -> Result<Value, ResponseModel> {
    if let Some(mongo) = self.get_mongo_provider() {
      let doc = mongo.update(table, id, data).await?;
      Ok(doc)
    } else {
      Err(err_response("MongoDB provider not available"))
    }
  }

  pub async fn get_by_id(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .find_by_id("groups", id)
      .await?
      .ok_or_else(|| err_response("Group not found"))?;
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn get_by_room_id(&self, room_id: &str) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "room_id": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let docs = self
      .base
      .get_json_provider()
      .find_many("groups", filter_opt.as_ref(), None, Some(1), None, true)
      .await?;
    if !docs.is_empty() {
      return Ok(success_response(DataValue::Object(
        docs.into_iter().next().unwrap(),
      )));
    }

    if let Some(mongo) = self.get_mongo_provider() {
      let mongo_docs = mongo
        .find_many("groups", filter_opt.as_ref(), None, Some(1), None, true)
        .await?;
      if !mongo_docs.is_empty() {
        return Ok(success_response(DataValue::Object(
          mongo_docs.into_iter().next().unwrap(),
        )));
      }
    }

    return Err(err_response("Group not found"));
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

    let json_docs = self
      .base
      .get_json_provider()
      .find_many("groups", filter_opt.as_ref(), skip, limit, None, true)
      .await?;
    all_docs.extend(json_docs);

    if let Some(mongo) = self.get_mongo_provider() {
      let mongo_docs = mongo
        .find_many("groups", filter_opt.as_ref(), skip, limit, None, true)
        .await?;
      for doc in mongo_docs {
        if !all_docs
          .iter()
          .any(|d| d.get("id") == doc.get("id") || d.get("room_id") == doc.get("room_id"))
        {
          all_docs.push(doc);
        }
      }
    }

    Ok(success_response(DataValue::Array(all_docs)))
  }

  pub async fn create(
    &self,
    data: Value,
    create_room: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut create_data = data;
    create_data["created_at"] = serde_json::json!(now);
    create_data["updated_at"] = serde_json::json!(now);
    let doc = mongo.insert("groups", create_data).await?;

    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.insert("groups", doc.clone()).await;
    }

    if create_room {
      if let Some(room_id) = doc.get("room_id").and_then(|v| v.as_str()) {
        let name = doc.get("name").and_then(|v| v.as_str()).map(String::from);
        let member_ids: Vec<String> = doc
          .get("member_ids")
          .and_then(|v| v.as_array())
          .map(|arr| {
            arr
              .iter()
              .filter_map(|v| v.as_str().map(String::from))
              .collect()
          })
          .unwrap_or_default();

        let room_data = json!({
          "name": name,
          "room": room_id,
          "is_group": true,
          "participant_ids": member_ids,
          "created_at": now,
          "updated_at": now
        });

        let mongo_room = self
          .get_mongo_provider()
          .ok_or_else(|| err_response("MongoDB not available"))?;
        let room_doc = mongo_room.insert("rooms", room_data).await?;

        if let DataProvider::Json(p) = json_provider {
          let _ = p.insert("rooms", room_doc).await;
        }
      }
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut update_data = data;
    update_data["updated_at"] = serde_json::json!(now);
    let doc = mongo.patch("groups", id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("groups", id, update_data).await;
    }
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn add_members(
    &self,
    room_id: &str,
    member_ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let filter = json!({ "room_id": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );
    let docs = mongo
      .find_many("groups", filter_opt.as_ref(), None, Some(1), None, true)
      .await?;
    let existing = docs
      .first()
      .cloned()
      .ok_or_else(|| err_response("Group not found"))?;
    let group_id = existing
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or(room_id);

    let mut members: Vec<String> = existing
      .get("member_ids")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default();

    for member_id in member_ids {
      if !members.contains(&member_id) {
        members.push(member_id);
      }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "member_ids": members.clone(), "updated_at": now });
    let doc = mongo.patch("groups", group_id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("groups", group_id, update_data).await;
    }
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn remove_members(
    &self,
    id: &str,
    member_ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let existing = mongo
      .find_by_id("groups", id)
      .await?
      .ok_or_else(|| err_response("Group not found"))?;

    let mut members: Vec<String> = existing
      .get("member_ids")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default();

    members.retain(|m| !member_ids.contains(m));

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "member_ids": members.clone(), "updated_at": now });
    let doc = mongo.patch("groups", id, update_data.clone()).await?;
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("groups", id, update_data).await;
    }
    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let is_1on1 = id.starts_with("dm_");

    let existing = if is_1on1 {
      None
    } else {
      let by_id_filter = json!({ "id": id });
      let by_id_filter_opt = Some(
        nosql_orm::query::Filter::from_json(&by_id_filter)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      );
      let docs = mongo
        .find_many(
          "groups",
          by_id_filter_opt.as_ref(),
          None,
          Some(1),
          None,
          true,
        )
        .await?;
      docs.first().cloned()
    };

    let (doc_id, room_id) = if let Some(existing_doc) = existing {
      let d_id = existing_doc
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or(id);
      let r_id = existing_doc
        .get("room_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
      (d_id.to_string(), r_id.to_string())
    } else if is_1on1 {
      (id.to_string(), id.to_string())
    } else {
      let by_room_filter = json!({ "room_id": id });
      let by_room_filter_opt = Some(
        nosql_orm::query::Filter::from_json(&by_room_filter)
          .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
      );
      let docs = mongo
        .find_many(
          "groups",
          by_room_filter_opt.as_ref(),
          None,
          Some(1),
          None,
          true,
        )
        .await?;
      if let Some(existing_doc) = docs.first().cloned() {
        let d_id = existing_doc
          .get("id")
          .and_then(|v| v.as_str())
          .unwrap_or(id);
        let r_id = existing_doc
          .get("room_id")
          .and_then(|v| v.as_str())
          .unwrap_or("");
        (d_id.to_string(), r_id.to_string())
      } else {
        return Err(err_response("Group not found"));
      }
    };

    self.cascade_delete_room(&room_id).await?;

    if !is_1on1 {
      let _ = mongo.delete("groups", &doc_id).await;
      let json_provider = self.base.get_json_provider();
      if let DataProvider::Json(p) = json_provider {
        let _ = p.delete("groups", &doc_id).await;
      }
    }

    Ok(success_response(DataValue::Object(json!({}))))
  }

  async fn cascade_delete_room(&self, room_id: &str) -> Result<(), ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    if room_id.is_empty() {
      return Ok(());
    }

    let chat_filter = json!({ "room_id": room_id });
    if let Ok(chat_filter_obj) = nosql_orm::query::Filter::from_json(&chat_filter) {
      let chat_docs: Vec<serde_json::Value> = mongo
        .find_many("chats", Some(&chat_filter_obj), None, None, None, true)
        .await
        .unwrap_or_default();
      for chat_doc in chat_docs {
        if let Some(chat_id) = chat_doc.get("id").and_then(|v| v.as_str()) {
          let _ = mongo.delete("chats", chat_id).await;
          let _ = mongo.delete("messages", chat_id).await;
        }
      }

      let json_provider = self.base.get_json_provider();
      if let DataProvider::Json(p) = json_provider {
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
            let _ = p.delete("messages", chat_id).await;
          }
        }
      }
    }

    let room_filter = json!({ "room": room_id });
    if let Ok(room_filter_obj) = nosql_orm::query::Filter::from_json(&room_filter) {
      let room_docs: Vec<serde_json::Value> = mongo
        .find_many("rooms", Some(&room_filter_obj), None, None, None, true)
        .await
        .unwrap_or_default();
      for room_doc in room_docs {
        if let Some(room_doc_id) = room_doc.get("id").and_then(|v| v.as_str()) {
          let _ = mongo.delete("rooms", room_doc_id).await;
        }
      }
      let json_provider = self.base.get_json_provider();
      if let DataProvider::Json(p) = json_provider {
        let json_room_docs: Vec<serde_json::Value> = DatabaseProvider::find_many(
          p.as_ref(),
          "rooms",
          Some(&room_filter_obj),
          None,
          None,
          None,
          true,
        )
        .await
        .unwrap_or_default();
        for room_doc in json_room_docs {
          if let Some(room_doc_id) = room_doc.get("id").and_then(|v| v.as_str()) {
            let _ = p.delete("rooms", room_doc_id).await;
          }
        }
      }
    }

    Ok(())
  }

  pub async fn hard_delete_cascade(&self, room_id: &str) -> Result<ResponseModel, ResponseModel> {
    // Try MongoDB first (primary database), fallback to JSON
    let filter = json!({ "room_id": room_id });
    let filter_obj = nosql_orm::query::Filter::from_json(&filter)
      .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;

    let group_opt = if let Some(mongo) = self.get_mongo_provider() {
      mongo
        .find_many("groups", Some(&filter_obj), None, Some(1), None, true)
        .await
        .ok()
        .and_then(|mut g| g.pop())
    } else {
      None
    };

    let group = if let Some(g) = group_opt {
      g
    } else {
      let json_docs = self
        .base
        .get_json_provider()
        .find_many("groups", Some(&filter_obj), None, Some(1), None, true)
        .await?;
      json_docs
        .into_iter()
        .next()
        .ok_or_else(|| err_response("Group not found"))?
    };

    let actual_room_id = group
      .get("room_id")
      .and_then(|v| v.as_str())
      .unwrap_or(room_id);

    if !actual_room_id.is_empty() {
      let chat_filter = json!({ "room_id": actual_room_id });
      if let Ok(chat_filter_obj) = nosql_orm::query::Filter::from_json(&chat_filter) {
        // Delete chats from JSON provider
        let json_provider = self.base.get_json_provider();
        if let DataProvider::Json(p) = json_provider {
          let json_chat_docs: Vec<serde_json::Value> = json_provider
            .find_many("chats", Some(&chat_filter_obj), None, None, None, true)
            .await
            .unwrap_or_default();
          for doc in json_chat_docs {
            if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
              let _ = p.delete("chats", doc_id).await;
            }
          }
        }

        // Delete chats from MongoDB
        if let Some(mongo) = self.get_mongo_provider() {
          let mongo_docs: Vec<serde_json::Value> = mongo
            .find_many("chats", Some(&chat_filter_obj), None, None, None, true)
            .await
            .unwrap_or_default();
          for doc in mongo_docs {
            if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
              let _ = mongo.delete("chats", doc_id).await;
            }
          }
        }
      }
    }

    // Delete group from JSON provider
    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let group_filter = json!({ "room_id": room_id });
      if let Ok(group_filter_obj) = nosql_orm::query::Filter::from_json(&group_filter) {
        let group_docs: Vec<serde_json::Value> = json_provider
          .find_many("groups", Some(&group_filter_obj), None, Some(1), None, true)
          .await
          .unwrap_or_default();
        for doc in group_docs {
          if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
            let _ = p.delete("groups", doc_id).await;
          }
        }
      }
    }

    // Delete group from MongoDB
    if let Some(mongo) = self.get_mongo_provider() {
      let group_filter = json!({ "room_id": room_id });
      if let Ok(group_filter_obj) = nosql_orm::query::Filter::from_json(&group_filter) {
        let group_docs: Vec<serde_json::Value> = mongo
          .find_many("groups", Some(&group_filter_obj), None, None, None, true)
          .await
          .unwrap_or_default();
        for doc in group_docs {
          if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
            let _ = mongo.delete("groups", doc_id).await;
          }
        }
      }

      // Soft delete related rooms
      let room_filter = json!({ "room": actual_room_id });
      if let Ok(room_filter_obj) = nosql_orm::query::Filter::from_json(&room_filter) {
        let rooms: Vec<serde_json::Value> = mongo
          .find_many("rooms", Some(&room_filter_obj), None, None, None, true)
          .await
          .unwrap_or_default();
        for room_doc in rooms {
          if let Some(rid) = room_doc.get("id").and_then(|v| v.as_str()) {
            let _ = mongo.delete("rooms", rid).await;
          }
        }
      }
    }

    // Delete room from JSON provider
    if let DataProvider::Json(p) = json_provider {
      let room_filter = json!({ "room": actual_room_id });
      if let Ok(room_filter_obj) = nosql_orm::query::Filter::from_json(&room_filter) {
        let room_docs: Vec<serde_json::Value> = json_provider
          .find_many("rooms", Some(&room_filter_obj), None, Some(1), None, true)
          .await
          .unwrap_or_default();
        for doc in room_docs {
          if let Some(doc_id) = doc.get("id").and_then(|v| v.as_str()) {
            let _ = p.delete("rooms", doc_id).await;
          }
        }
      }
    }

    Ok(success_response(DataValue::Object(json!({
      "room_id": actual_room_id,
      "deleted": true
    }))))
  }
}
