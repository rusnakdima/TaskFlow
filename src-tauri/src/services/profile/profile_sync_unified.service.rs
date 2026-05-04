/* sys lib */
use std::sync::Arc;
use std::time::Duration;

/* nosql_orm */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;
use serde_json::{json, Value};

/* tokio */
use tokio::time::timeout;

/* providers */
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;

/* entities */
use crate::entities::profile_entity::ProfileEntity;
use crate::entities::response_entity::ResponseModel;

/* helpers */
use crate::helpers::response_helper::{err_response, log_response};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileSyncStatus {
  InBoth,
  SyncedToCloud,
  SyncedToLocal,
  NotFound,
}

#[derive(Clone)]
pub struct ProfileSyncUnifiedService {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl ProfileSyncUnifiedService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn get_profile(&self, user_id: &str) -> Result<Option<ProfileEntity>, ResponseModel> {
    let profile_val = self.get_profile_value(user_id).await?;
    match profile_val {
      Some(val) => {
        let profile = serde_json::from_value::<ProfileEntity>(val)
          .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
        Ok(Some(profile))
      }
      None => Ok(None),
    }
  }

  pub async fn get_profile_value(&self, user_id: &str) -> Result<Option<Value>, ResponseModel> {
    let table_name = "profiles";
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));

    println!("[ProfileSync] get_profile_value user_id: {}", user_id);

    // Step 1: Check JSON first (fast, works offline)
    match self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, false)
      .await
    {
      Ok(mut profiles) => {
        println!(
          "[ProfileSync] JSON find returned {} profiles",
          profiles.len()
        );
        if let Some(profile_val) = profiles.pop() {
          println!(
            "[ProfileSync] Profile found in JSON for user_id: {}",
            user_id
          );
          return Ok(Some(profile_val));
        }
        println!("[ProfileSync] No profile in JSON for user_id: {}", user_id);
      }
      Err(e) => {
        println!("[ProfileSync] Error checking JSON for profile: {}", e);
      }
    }

    // Step 2: If profile not in JSON and MongoDB is available, try with timeout
    if let Some(mongo) = &self.mongodb_provider {
      println!("[ProfileSync] MongoDB provider exists, querying with timeout...");
      let mongo_result = timeout(
        Duration::from_secs(5),
        mongo.find_many(table_name, Some(&filter), None, None, None, false),
      )
      .await;

      match mongo_result {
        Ok(Ok(mut profiles)) => {
          println!(
            "[ProfileSync] MongoDB find returned {} profiles",
            profiles.len()
          );
          if let Some(profile_val) = profiles.pop() {
            let profile_id = profile_val
              .get("id")
              .and_then(|v| v.as_str())
              .unwrap_or("unknown");

            println!("[ProfileSync] Profile found in MongoDB, id: {}", profile_id);
            match self.json_provider.find_by_id(table_name, profile_id).await {
              Ok(Some(_)) => {
                println!("[ProfileSync] Profile already in JSON");
              }
              Ok(None) | Err(_) => {
                println!("[ProfileSync] Syncing profile from MongoDB to JSON");
                if let Err(e) = self
                  .json_provider
                  .insert(table_name, profile_val.clone())
                  .await
                {
                  println!("[ProfileSync] Failed to sync profile to JSON: {}", e);
                } else {
                  println!(
                    "[ProfileSync] Profile synced from MongoDB to JSON for user_id: {}",
                    user_id
                  );
                }
              }
            }
            return Ok(Some(profile_val));
          }
          println!(
            "[ProfileSync] No profile in MongoDB for user_id: {}",
            user_id
          );
        }
        Ok(Err(e)) => {
          println!("[ProfileSync] Error checking MongoDB for profile: {}", e);
        }
        Err(_) => {
          println!("[ProfileSync] MongoDB query timed out after 5 seconds (offline)");
        }
      }
    } else {
      println!("[ProfileSync] No MongoDB provider (offline mode)");
    }

    println!("[ProfileSync] Profile not found for user_id: {}", user_id);
    Ok(None)
  }

  pub async fn profile_exists(&self, user_id: &str) -> Result<ProfileSyncStatus, ResponseModel> {
    let in_json = self.profile_exists_in_json(user_id).await;
    let in_mongo = self.profile_exists_in_mongo(user_id).await;

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

  pub async fn profile_exists_in_json(&self, user_id: &str) -> bool {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    self
      .json_provider
      .find_many("profiles", Some(&filter), None, None, None, false)
      .await
      .map(|mut profiles| profiles.pop().is_some())
      .unwrap_or(false)
  }

  pub async fn profile_exists_in_mongo(&self, user_id: &str) -> bool {
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

  async fn get_profile_from_json(&self, user_id: &str) -> Result<Option<Value>, ResponseModel> {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let profiles = self
      .json_provider
      .find_many("profiles", Some(&filter), None, None, None, false)
      .await
      .map_err(|e| err_response(&format!("Failed to get profile from JSON: {}", e)))?;
    Ok(profiles.into_iter().next())
  }

  async fn get_profile_from_mongo(&self, user_id: &str) -> Result<Option<Value>, ResponseModel> {
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

  pub async fn sync_profile_to_mongo_by_user(&self, user_id: &str) -> Result<(), ResponseModel> {
    let profile_data = self
      .get_profile_from_json(user_id)
      .await?
      .ok_or_else(|| err_response("Profile not found in JSON"))?;

    let profile_id = profile_data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| err_response("Profile data missing id"))?
      .to_string();

    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let existing = mongo
      .find_by_id("profiles", &profile_id)
      .await
      .ok()
      .flatten();
    if existing.is_some() {
      mongo
        .update("profiles", &profile_id, profile_data)
        .await
        .map_err(|e| err_response(&format!("Failed to update profile in MongoDB: {}", e)))?;
    } else {
      mongo
        .insert("profiles", profile_data)
        .await
        .map_err(|e| err_response(&format!("Failed to insert profile in MongoDB: {}", e)))?;
    }

    log_response(&format!(
      "Profile synced to MongoDB for user_id: {}",
      user_id
    ));
    Ok(())
  }

  pub async fn sync_profile_to_json_by_user(&self, user_id: &str) -> Result<(), ResponseModel> {
    let profile_data = self
      .get_profile_from_mongo(user_id)
      .await?
      .ok_or_else(|| err_response("Profile not found in MongoDB"))?;

    let profile_id = profile_data
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| err_response("Profile data missing id"))?
      .to_string();

    let existing = self
      .json_provider
      .find_by_id("profiles", &profile_id)
      .await
      .ok()
      .flatten();

    if existing.is_some() {
      self
        .json_provider
        .update("profiles", &profile_id, profile_data)
        .await
        .map_err(|e| err_response(&format!("Failed to update profile in JSON: {}", e)))?;
    } else {
      self
        .json_provider
        .insert("profiles", profile_data)
        .await
        .map_err(|e| err_response(&format!("Failed to insert profile in JSON: {}", e)))?;
    }

    log_response(&format!("Profile synced to JSON for user_id: {}", user_id));
    Ok(())
  }

  pub async fn ensure_profile_in_both(
    &self,
    user_id: &str,
  ) -> Result<ProfileSyncStatus, ResponseModel> {
    self.profile_exists(user_id).await
  }

  pub async fn create_profile_in_json(&self, profile: &ProfileEntity) -> Result<(), ResponseModel> {
    let profile_val = serde_json::to_value(profile)
      .map_err(|e| err_response(&format!("Failed to serialize profile: {}", e)))?;

    self
      .json_provider
      .insert("profiles", profile_val)
      .await
      .map_err(|e| err_response(&format!("Failed to create profile in JSON: {}", e)))?;

    log_response(&format!(
      "Profile created in JSON for user_id: {}",
      profile.user_id
    ));
    Ok(())
  }

  pub async fn export_profile_to_mongo(
    &self,
    profile: &ProfileEntity,
  ) -> Result<(), ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;

    let profile_val = serde_json::to_value(profile)
      .map_err(|e| err_response(&format!("Failed to serialize profile: {}", e)))?;

    let profile_id = profile
      .id
      .as_ref()
      .ok_or_else(|| err_response("Profile id is required"))?;

    let existing = mongo
      .find_by_id("profiles", profile_id)
      .await
      .ok()
      .flatten();
    if existing.is_some() {
      mongo
        .update("profiles", profile_id, profile_val)
        .await
        .map_err(|e| err_response(&format!("Failed to update profile in MongoDB: {}", e)))?;
    } else {
      mongo
        .insert("profiles", profile_val)
        .await
        .map_err(|e| err_response(&format!("Failed to insert profile in MongoDB: {}", e)))?;
    }

    log_response(&format!(
      "Profile exported to MongoDB for user_id: {}",
      profile.user_id
    ));
    Ok(())
  }
}
