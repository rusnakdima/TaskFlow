use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::{err_response, success_response};
use crate::helpers::visibility::get_visibility;
use crate::providers::data_provider::DataProvider;
use nosql_orm::cascade::CascadeManager;
use nosql_orm::provider::DatabaseProvider;
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

  fn get_json_provider(&self) -> &DataProvider {
    &self.json_provider
  }

  fn get_mongo_provider(&self) -> Option<&DataProvider> {
    self.mongo_provider.as_ref()
  }

  pub async fn get_by_id(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .json_provider
      .find_by_id("chats", id)
      .await?
      .ok_or_else(|| err_response("Chat not found"))?;
    Ok(success_response(doc))
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
      .json_provider
      .find_many(
        "chats",
        filter_opt.as_ref(),
        skip,
        limit,
        Some("created_at"),
        true,
      )
      .await?;

    let mut enriched_docs: Vec<Value> = Vec::new();
    let json_provider = self.get_json_provider();

    for doc in docs {
      let mut enriched = doc.clone();
      let sender_id = enriched
        .get("sender_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

      if let Some(sid) = sender_id {
        if let Some(user_val) = json_provider.find_by_id("users", &sid).await.ok().flatten() {
          let mut sender_user = user_val.clone();
          sender_user.as_object_mut().map(|obj| {
            obj.remove("password");
            obj.remove("totp_secret");
            obj.remove("recovery_codes");
          });

          if let Some(profile_id) = sender_user.get("profile_id").and_then(|v| v.as_str()) {
            if let Some(profile_val) = json_provider
              .find_by_id("profiles", profile_id)
              .await
              .ok()
              .flatten()
            {
              sender_user["profile"] = profile_val.clone();

              let sender_name = profile_val
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| {
                  let last = profile_val
                    .get("last_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                  if last.is_empty() {
                    s.to_string()
                  } else {
                    format!("{} {}", s, last)
                  }
                })
                .unwrap_or_else(|| sid.clone());

              let sender_avatar = profile_val
                .get("image_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();

              enriched["sender_name"] = serde_json::json!(sender_name);
              enriched["sender_avatar"] = serde_json::json!(sender_avatar);
            }
          }

          enriched["sender"] = sender_user;
          enriched["sender_id"] = serde_json::json!(sid);
        }
      }
      enriched_docs.push(enriched);
    }

    Ok(success_response(enriched_docs))
  }

  pub async fn get_all(
    &self,
    visibility: &str,
    filter: Option<Value>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let offline = std::env::var("OFFLINE_MODE").unwrap_or_default() == "true";
    let use_json = visibility == "private" || offline || visibility == "all";

    let provider = if use_json {
      self.json_provider.clone()
    } else {
      self.mongo_provider.clone().ok_or_else(|| err_response(
        "MongoDB not available - cannot access shared/team records. Please connect to the internet or change visibility to private.",
      ))?
    };

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
    Ok(success_response(docs))
  }

  pub async fn create(&self, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut create_data = data;
    create_data["created_at"] = serde_json::json!(now);
    create_data["updated_at"] = serde_json::json!(now);
    let doc: Value = mongo.insert("chats", create_data).await?;
    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.insert("chats", doc.clone()).await;
    }
    Ok(success_response(doc))
  }

  pub async fn update(&self, id: &str, data: Value) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut update_data = data;
    update_data["updated_at"] = serde_json::json!(now);
    let doc: Value = mongo.patch("chats", id, update_data.clone()).await?;
    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", id, update_data).await;
    }
    Ok(success_response(doc))
  }

  pub async fn mark_read(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
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
    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", id, update_data).await;
    }
    Ok(success_response(doc))
  }

  pub async fn delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let existing: Value = mongo
      .find_by_id("chats", id)
      .await?
      .ok_or_else(|| err_response("Chat not found"))?;
    let _visibility = get_visibility(&existing);

    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "deleted_at": now, "updated_at": now });
    let _doc: Value = mongo.patch("chats", id, update_data.clone()).await?;

    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete("chats", id).await;
      let _ = p.patch("chats", id, update_data).await;
    }

    Ok(success_response(json!({})))
  }

  pub async fn hard_delete(&self, id: &str) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let _ = mongo.delete("chats", id).await;

    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.delete("chats", id).await;
    }

    Ok(success_response(json!({ "id": id, "deleted": true })))
  }

  pub async fn edit_message(
    &self,
    id: &str,
    content: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let update_data = json!({ "content": content, "updated_at": now, "is_edited": true });
    let doc: Value = mongo.patch("chats", id, update_data.clone()).await?;

    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", id, update_data).await;
    }

    Ok(success_response(doc))
  }

  pub async fn add_reaction(
    &self,
    message_id: &str,
    emoji: &str,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let chat = mongo
      .find_by_id("chats", message_id)
      .await?
      .ok_or_else(|| err_response("Message not found"))?;

    let mut reactions = chat
      .get("reactions")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();

    let emoji_str = emoji.to_string();
    if let Some(existing) = reactions
      .iter_mut()
      .find(|r| r.get("emoji").and_then(|v| v.as_str()) == Some(&emoji_str))
    {
      let count = existing.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
      existing["count"] = serde_json::json!(count + 1);
      let mut user_ids = existing
        .get("user_ids")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
      if !user_ids.iter().any(|id| id.as_str() == Some(user_id)) {
        user_ids.push(serde_json::json!(user_id));
      }
      existing["user_ids"] = serde_json::json!(user_ids);
    } else {
      reactions.push(serde_json::json!({
        "emoji": emoji_str,
        "count": 1,
        "user_ids": [user_id]
      }));
    }

    let update_data = json!({ "reactions": reactions });
    let doc = mongo
      .patch("chats", message_id, update_data.clone())
      .await?;

    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", message_id, update_data).await;
    }

    Ok(success_response(doc))
  }

  pub async fn remove_reaction(
    &self,
    message_id: &str,
    emoji: &str,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let chat = mongo
      .find_by_id("chats", message_id)
      .await?
      .ok_or_else(|| err_response("Message not found"))?;

    let reactions = chat
      .get("reactions")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();

    let emoji_str = emoji.to_string();
    let mut new_reactions: Vec<Value> = Vec::new();

    for r in reactions.into_iter() {
      if r.get("emoji").and_then(|v| v.as_str()) == Some(&emoji_str) {
        let count = r.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
        if count > 1 {
          let mut new_r = r.clone();
          new_r["count"] = serde_json::json!(count - 1);
          let mut user_ids = r
            .get("user_ids")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
          user_ids.retain(|id| id.as_str() != Some(user_id));
          new_r["user_ids"] = serde_json::json!(user_ids);
          new_reactions.push(new_r);
        }
      } else {
        new_reactions.push(r);
      }
    }

    let update_data = json!({ "reactions": new_reactions });
    let doc = mongo
      .patch("chats", message_id, update_data.clone())
      .await?;

    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let _ = p.patch("chats", message_id, update_data).await;
    }

    Ok(success_response(doc))
  }

  pub async fn delete_by_room(&self, room_id: &str) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "room_id": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let mongo = self
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

    let json_provider = self.get_json_provider();
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

    Ok(success_response(
      json!({ "room_id": room_id, "deleted": true }),
    ))
  }

  pub async fn hard_delete_by_room(&self, room_id: &str) -> Result<ResponseModel, ResponseModel> {
    let filter = json!({ "room_id": room_id });
    let filter_opt = Some(
      nosql_orm::query::Filter::from_json(&filter)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?,
    );

    let mongo = self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let docs: Vec<serde_json::Value> = mongo
      .find_many("chats", filter_opt.as_ref(), None, None, None, true)
      .await
      .unwrap_or_default();
    for doc in docs {
      if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
        let _ = mongo.delete("chats", id).await;
      }
    }

    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
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
          let _ = p.delete("chats", id).await;
        }
      }
    }

    Ok(success_response(
      json!({ "room_id": room_id, "deleted": true }),
    ))
  }
}
