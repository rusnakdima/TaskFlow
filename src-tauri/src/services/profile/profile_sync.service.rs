/* sys lib */
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;
use serde_json::{json, Value};

/* providers */
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;

/* entities */
use crate::entities::response_entity::ResponseModel;

/* helpers */
use crate::helpers::response_helper::err_response;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum ProfileSyncStatus {
  InBoth,
  SyncedToCloud,
  SyncedToLocal,
  NotFound,
}

#[derive(Clone)]
pub struct ProfileSyncService {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl ProfileSyncService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn profile_exists_in_json_by_user(&self, user_id: &str) -> bool {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    self
      .json_provider
      .find_many("profiles", Some(&filter), None, None, None, false)
      .await
      .map(|mut profiles| profiles.pop().is_some())
      .unwrap_or(false)
  }

  pub async fn profile_exists_in_mongo_by_user(&self, user_id: &str) -> bool {
    if let Some(mongo) = &self.mongodb_provider {
      let filter = Filter::Eq("user_id".to_string(), json!(user_id));
      mongo
        .find_many("profiles", Some(&filter), None, None, None, false)
        .await
        .map(|mut profiles| profiles.pop().is_some())
        .unwrap_or(false)
    } else {
      false
    }
  }

  pub async fn get_profile_from_json_by_user(
    &self,
    user_id: &str,
  ) -> Result<Option<Value>, ResponseModel> {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let profiles = self
      .json_provider
      .find_many("profiles", Some(&filter), None, None, None, false)
      .await
      .map_err(|e| err_response(&format!("Failed to get profile from JSON: {}", e)))?;
    Ok(profiles.into_iter().next())
  }

  pub async fn get_profile_from_mongo_by_user(
    &self,
    user_id: &str,
  ) -> Result<Option<Value>, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let profiles = mongo
      .find_many("profiles", Some(&filter), None, None, None, false)
      .await
      .map_err(|e| err_response(&format!("Failed to get profile from MongoDB: {}", e)))?;
    Ok(profiles.into_iter().next())
  }

  async fn upsert_to_mongo(&self, profile_data: &Value) -> Result<(), ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let profile_id = profile_data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| err_response("Profile data missing id"))?;

    let existing = mongo
      .find_by_id("profiles", profile_id)
      .await
      .ok()
      .flatten();
    if existing.is_some() {
      mongo
        .update("profiles", profile_id, profile_data.clone())
        .await
        .map_err(|e| err_response(&format!("Failed to update profile in MongoDB: {}", e)))?;
    } else {
      mongo
        .insert("profiles", profile_data.clone())
        .await
        .map_err(|e| err_response(&format!("Failed to insert profile in MongoDB: {}", e)))?;
    }
    Ok(())
  }

  async fn upsert_to_json(&self, profile_data: &Value) -> Result<(), ResponseModel> {
    let profile_id = profile_data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| err_response("Profile data missing id"))?;

    let existing = self
      .json_provider
      .find_by_id("profiles", profile_id)
      .await
      .ok()
      .flatten();
    if existing.is_some() {
      self
        .json_provider
        .update("profiles", profile_id, profile_data.clone())
        .await
        .map_err(|e| err_response(&format!("Failed to update profile in JSON: {}", e)))?;
    } else {
      self
        .json_provider
        .insert("profiles", profile_data.clone())
        .await
        .map_err(|e| err_response(&format!("Failed to insert profile in JSON: {}", e)))?;
    }
    Ok(())
  }

  pub async fn sync_profile_to_mongo_by_user(&self, user_id: &str) -> Result<(), ResponseModel> {
    let profile_data = self
      .get_profile_from_json_by_user(user_id)
      .await?
      .ok_or_else(|| err_response("Profile not found in JSON"))?;
    self.upsert_to_mongo(&profile_data).await
  }

  pub async fn sync_profile_to_json_by_user(&self, user_id: &str) -> Result<(), ResponseModel> {
    let profile_data = self
      .get_profile_from_mongo_by_user(user_id)
      .await?
      .ok_or_else(|| err_response("Profile not found in MongoDB"))?;
    self.upsert_to_json(&profile_data).await
  }

  pub async fn ensure_profile_in_both(
    &self,
    user_id: &str,
  ) -> Result<ProfileSyncStatus, ResponseModel> {
    let in_json = self.profile_exists_in_json_by_user(user_id).await;
    let in_mongo = self.profile_exists_in_mongo_by_user(user_id).await;

    match (in_json, in_mongo) {
      (true, true) => Ok(ProfileSyncStatus::InBoth),
      (true, false) => {
        self.sync_profile_to_mongo_by_user(user_id).await?;
        Ok(ProfileSyncStatus::SyncedToCloud)
      }
      (false, true) => {
        self.sync_profile_to_json_by_user(user_id).await?;
        Ok(ProfileSyncStatus::SyncedToLocal)
      }
      (false, false) => Ok(ProfileSyncStatus::NotFound),
    }
  }
}
