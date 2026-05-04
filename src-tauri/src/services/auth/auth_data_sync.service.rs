/* sys lib */
use std::sync::Arc;

/* entities */
use crate::entities::response_entity::ResponseModel;
use serde::{Deserialize, Serialize};

/* services */
use crate::services::profile::profile_sync_unified::{
  ProfileSyncStatus, ProfileSyncUnifiedService,
};
use crate::services::user::user_sync::{UserSyncService, UserSyncStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDataResult {
  pub user_found: bool,
  pub profile_found: bool,
  pub needs_registration: bool,
  pub needs_profile: bool,
  pub message: String,
}

#[derive(Clone)]
pub struct AuthDataSyncService {
  user_sync_service: Arc<UserSyncService>,
  profile_sync_service: Arc<ProfileSyncUnifiedService>,
}

impl AuthDataSyncService {
  pub fn new(
    user_sync_service: Arc<UserSyncService>,
    profile_sync_service: Arc<ProfileSyncUnifiedService>,
  ) -> Self {
    Self {
      user_sync_service,
      profile_sync_service,
    }
  }

  pub async fn initialize_user_data(&self, user_id: &str) -> Result<UserDataResult, ResponseModel> {
    println!(
      "[AuthDataSync] initialize_user_data called with user_id: {}",
      user_id
    );

    // Step 1: Check if user exists in JSON (fast, offline-capable)
    println!("[AuthDataSync] Step 1: Checking if user exists in JSON");
    let user_in_json = self.user_sync_service.user_exists_in_json(user_id).await;
    println!("[AuthDataSync] User in JSON: {}", user_in_json);

    if !user_in_json {
      // User not found in JSON - check MongoDB but with timeout
      println!("[AuthDataSync] User not in JSON, checking MongoDB...");
      let user_in_mongo = self.user_sync_service.user_exists_in_mongo(user_id).await;
      if !user_in_mongo {
        println!("[AuthDataSync] User not found in either database");
        return Ok(UserDataResult {
          user_found: false,
          profile_found: false,
          needs_registration: true,
          needs_profile: false,
          message: "User not found".to_string(),
        });
      }
      // User in MongoDB - try to sync to JSON but don't block
      println!("[AuthDataSync] User found in MongoDB, attempting sync to JSON");
      let _ = self.user_sync_service.sync_user_to_json(user_id).await;
      println!("[AuthDataSync] User synced from MongoDB to JSON");
    } else {
      println!("[AuthDataSync] User found in JSON (offline mode)");
    }

    // Step 2: Check profile in JSON first (offline-capable)
    println!("[AuthDataSync] Step 2: Checking profile in JSON");
    let profile_in_json = self
      .profile_sync_service
      .profile_exists_in_json(user_id)
      .await;
    println!("[AuthDataSync] Profile in JSON: {}", profile_in_json);

    if profile_in_json {
      println!("[AuthDataSync] Profile found in JSON - returning success (offline mode)");
      return Ok(UserDataResult {
        user_found: true,
        profile_found: true,
        needs_registration: false,
        needs_profile: false,
        message: "Data loaded from local storage".to_string(),
      });
    }

    // Profile not in JSON - try MongoDB with timeout
    println!("[AuthDataSync] Profile not in JSON, checking MongoDB...");
    let profile_in_mongo = self
      .profile_sync_service
      .profile_exists_in_mongo(user_id)
      .await;
    println!("[AuthDataSync] Profile in MongoDB: {}", profile_in_mongo);

    if profile_in_mongo {
      // Try to sync to JSON but don't block
      println!("[AuthDataSync] Profile found in MongoDB, attempting sync to JSON");
      let _ = self
        .profile_sync_service
        .sync_profile_to_json_by_user(user_id)
        .await;
      println!("[AuthDataSync] Profile synced from MongoDB to JSON");
      return Ok(UserDataResult {
        user_found: true,
        profile_found: true,
        needs_registration: false,
        needs_profile: false,
        message: "Data synced from cloud".to_string(),
      });
    }

    println!("[AuthDataSync] Profile not found - needs profile creation");
    Ok(UserDataResult {
      user_found: true,
      profile_found: false,
      needs_registration: false,
      needs_profile: true,
      message: "Profile not found".to_string(),
    })
  }

  pub async fn on_user_login(&self, user_id: &str) -> Result<UserDataResult, ResponseModel> {
    self.initialize_user_data(user_id).await
  }

  pub async fn check_user_registration_needed(&self, user_id: &str) -> Result<bool, ResponseModel> {
    let user_status = self.user_sync_service.ensure_user_in_both(user_id).await?;
    Ok(user_status == UserSyncStatus::NotFound)
  }

  pub async fn check_profile_creation_needed(&self, user_id: &str) -> Result<bool, ResponseModel> {
    let user_status = self.user_sync_service.ensure_user_in_both(user_id).await?;
    if user_status == UserSyncStatus::NotFound {
      return Ok(true);
    }
    let profile_status = self
      .profile_sync_service
      .ensure_profile_in_both(user_id)
      .await?;
    Ok(profile_status == ProfileSyncStatus::NotFound)
  }
}
