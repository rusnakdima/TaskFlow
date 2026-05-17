use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, success_response};
use crate::providers::data_provider::DataProvider;
use crate::services::base_crud_service::{BaseCrudService, BaseCrudServiceTrait};
use nosql_orm::cascade::CascadeManager;
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
    let doc = self
      .base
      .get_json_provider()
      .insert("groups", data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.insert("groups", data).await;
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
          "participant_ids": member_ids
        });

        let _ = self.insert_to_mongo("rooms", room_data).await;
      }
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .base
      .get_json_provider()
      .update("groups", id, data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.update("groups", id, data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn add_members(
    &self,
    id: &str,
    member_ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
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

    for member_id in member_ids {
      if !members.contains(&member_id) {
        members.push(member_id);
      }
    }

    let update_data = json!({ "member_ids": members.clone() });
    let doc = self
      .base
      .get_json_provider()
      .update("groups", id, update_data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.update("groups", id, update_data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn remove_members(
    &self,
    id: &str,
    member_ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let existing = self
      .base
      .get_json_provider()
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

    let update_data = json!({ "member_ids": members.clone() });
    let doc = self
      .base
      .get_json_provider()
      .update("groups", id, update_data.clone())
      .await?;

    if let Some(mongo) = self.get_mongo_provider() {
      let _ = mongo.update("groups", id, update_data).await;
    }

    Ok(success_response(DataValue::Object(doc)))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let _ = self
      .base
      .get_json_provider()
      .find_by_id("groups", id)
      .await?
      .ok_or_else(|| err_response("Group not found"))?;

    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete("groups", id).await;
    }

    if let Some(mongo) = self.get_mongo_provider() {
      let update_data = json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });
      let _ = mongo.update("groups", id, update_data).await;
    }

    Ok(success_response(DataValue::Object(json!({}))))
  }

  pub async fn hard_delete_cascade(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let group = self
      .base
      .get_json_provider()
      .find_by_id("groups", id)
      .await?
      .ok_or_else(|| err_response("Group not found"))?;

    let room_id = group.get("room_id").and_then(|v| v.as_str()).unwrap_or("");

    if !room_id.is_empty() {
      let filter = json!({ "room_id": room_id });
      if let Ok(filter_obj) = nosql_orm::query::Filter::from_json(&filter) {
        let json_provider = self.base.get_json_provider();
        if let DataProvider::Json(p) = json_provider {
          let cascade = CascadeManager::new(p.as_ref().clone());
          let filter_opt = Some(&filter_obj);
          let docs: Vec<serde_json::Value> =
            DatabaseProvider::find_many(p.as_ref(), "chats", filter_opt, None, None, None, true)
              .await
              .unwrap_or_default();
          for doc in docs {
            if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
              let _ = cascade.soft_delete("chats", id).await;
            }
          }
        }
      }
    }

    let json_provider = self.base.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete("groups", id).await;
    }

    if let Some(mongo) = self.get_mongo_provider() {
      let update_data = json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });
      let _ = mongo.update("groups", id, update_data.clone()).await;

      if !room_id.is_empty() {
        let filter = json!({ "room": room_id });
        if let Ok(filter_obj) = nosql_orm::query::Filter::from_json(&filter) {
          let rooms: Vec<serde_json::Value> = mongo
            .find_many("rooms", Some(&filter_obj), None, None, None, true)
            .await
            .unwrap_or_default();
          for room_doc in rooms {
            if let Some(rid) = room_doc.get("id").and_then(|v| v.as_str()) {
              let _ = mongo.update("rooms", rid, update_data.clone()).await;
            }
          }
        }
      }
    }

    Ok(success_response(DataValue::Object(json!({
      "group_id": id,
      "room_id": room_id,
      "deleted": true
    }))))
  }
}
