/* sys lib */
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

/* nosql_orm */
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;

/* tokio */
use tokio::time::timeout;

/* providers */
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;

/* entities */
use crate::entities::response_entity::ResponseModel;

/* helpers */
use crate::helpers::response_helper::err_response;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum UserSyncStatus {
  InBoth,
  SyncedToCloud,
  SyncedToLocal,
  NotFound,
}

#[derive(Clone)]
pub struct UserSyncService {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl UserSyncService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn user_exists_in_json(&self, user_id: &str) -> bool {
    self
      .json_provider
      .find_by_id("users", user_id)
      .await
      .ok()
      .flatten()
      .is_some()
  }

  pub async fn user_exists_in_mongo(&self, user_id: &str) -> bool {
    if let Some(mongo) = &self.mongodb_provider {
      let result = timeout(Duration::from_secs(5), mongo.find_by_id("users", user_id)).await;
      match result {
        Ok(Ok(Some(_))) => true,
        Ok(Ok(None)) | Ok(Err(_)) | Err(_) => false,
      }
    } else {
      false
    }
  }

  pub async fn get_user_from_json(&self, user_id: &str) -> Result<Option<Value>, ResponseModel> {
    self
      .json_provider
      .find_by_id("users", user_id)
      .await
      .map_err(|e| err_response(&format!("Failed to get user from JSON: {}", e)))
  }

  pub async fn get_user_from_mongo(&self, user_id: &str) -> Result<Option<Value>, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    mongo
      .find_by_id("users", user_id)
      .await
      .map_err(|e| err_response(&format!("Failed to get user from MongoDB: {}", e)))
  }

  async fn upsert_to_mongo(&self, user_id: &str, user_data: Value) -> Result<(), ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let existing = mongo.find_by_id("users", user_id).await.ok().flatten();
    if existing.is_some() {
      mongo
        .update("users", user_id, user_data)
        .await
        .map_err(|e| err_response(&format!("Failed to update user in MongoDB: {}", e)))?;
    } else {
      mongo
        .insert("users", user_data)
        .await
        .map_err(|e| err_response(&format!("Failed to insert user in MongoDB: {}", e)))?;
    }
    Ok(())
  }

  async fn upsert_to_json(&self, user_data: Value) -> Result<(), ResponseModel> {
    let user_id = user_data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| err_response("User data missing id"))?
      .to_string();

    let existing = self
      .json_provider
      .find_by_id("users", &user_id)
      .await
      .ok()
      .flatten();
    if existing.is_some() {
      self
        .json_provider
        .update("users", &user_id, user_data.clone())
        .await
        .map_err(|e| err_response(&format!("Failed to update user in JSON: {}", e)))?;
    } else {
      self
        .json_provider
        .insert("users", user_data)
        .await
        .map_err(|e| err_response(&format!("Failed to insert user in JSON: {}", e)))?;
    }
    Ok(())
  }

  pub async fn sync_user_to_mongo(&self, user_id: &str) -> Result<(), ResponseModel> {
    let user_data = self
      .get_user_from_json(user_id)
      .await?
      .ok_or_else(|| err_response("User not found in JSON"))?;
    self.upsert_to_mongo(user_id, user_data).await
  }

  pub async fn sync_user_to_json(&self, user_id: &str) -> Result<(), ResponseModel> {
    let user_data = self
      .get_user_from_mongo(user_id)
      .await?
      .ok_or_else(|| err_response("User not found in MongoDB"))?;
    self.upsert_to_json(user_data).await
  }

  pub async fn ensure_user_in_both(&self, user_id: &str) -> Result<UserSyncStatus, ResponseModel> {
    let in_json = self.user_exists_in_json(user_id).await;
    println!("[UserSync] user_exists_in_json: {}", in_json);

    let in_mongo = self.user_exists_in_mongo(user_id).await;
    println!("[UserSync] user_exists_in_mongo: {}", in_mongo);

    match (in_json, in_mongo) {
      (true, true) => {
        println!("[UserSync] User in both JSON and MongoDB");
        Ok(UserSyncStatus::InBoth)
      }
      (true, false) => {
        println!("[UserSync] User in JSON only, syncing to MongoDB...");
        match timeout(Duration::from_secs(5), self.sync_user_to_mongo(user_id)).await {
          Ok(Ok(_)) => {
            println!("[UserSync] User synced to MongoDB successfully");
            Ok(UserSyncStatus::SyncedToCloud)
          }
          Ok(Err(e)) => {
            println!("[UserSync] Failed to sync user to MongoDB: {}", e.message);
            Ok(UserSyncStatus::SyncedToLocal) // Still count as synced to local
          }
          Err(_) => {
            println!("[UserSync] MongoDB sync timed out, continuing offline");
            Ok(UserSyncStatus::SyncedToLocal) // Continue with local only
          }
        }
      }
      (false, true) => {
        println!("[UserSync] User in MongoDB only, syncing to JSON...");
        match timeout(Duration::from_secs(5), self.sync_user_to_json(user_id)).await {
          Ok(Ok(_)) => {
            println!("[UserSync] User synced to JSON successfully");
            Ok(UserSyncStatus::SyncedToLocal)
          }
          Ok(Err(e)) => {
            println!("[UserSync] Failed to sync user to JSON: {}", e.message);
            Ok(UserSyncStatus::NotFound)
          }
          Err(_) => {
            println!("[UserSync] JSON sync timed out, continuing");
            Ok(UserSyncStatus::NotFound)
          }
        }
      }
      (false, false) => {
        println!("[UserSync] User not found in either database");
        Ok(UserSyncStatus::NotFound)
      }
    }
  }
}
