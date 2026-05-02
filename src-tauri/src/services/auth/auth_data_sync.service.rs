/* sys lib */
use std::sync::Arc;

/* entities */
use crate::entities::response_entity::ResponseModel;
use serde::{Deserialize, Serialize};

/* services */
use crate::services::profile::profile_sync::{ProfileSyncService, ProfileSyncStatus};
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
  profile_sync_service: Arc<ProfileSyncService>,
}

impl AuthDataSyncService {
  pub fn new(
    user_sync_service: Arc<UserSyncService>,
    profile_sync_service: Arc<ProfileSyncService>,
  ) -> Self {
    Self {
      user_sync_service,
      profile_sync_service,
    }
  }

  pub async fn initialize_user_data(&self, user_id: &str) -> Result<UserDataResult, ResponseModel> {
    // Step 1: Ensure user synced
    let user_status = self.user_sync_service.ensure_user_in_both(user_id).await?;

    if user_status == UserSyncStatus::NotFound {
      return Ok(UserDataResult {
        user_found: false,
        profile_found: false,
        needs_registration: true,
        needs_profile: false,
        message: "User not found".to_string(),
      });
    }

    // Step 2: Ensure profile synced (only if user exists)
    let profile_status = self
      .profile_sync_service
      .ensure_profile_in_both(user_id)
      .await?;

    if profile_status == ProfileSyncStatus::NotFound {
      return Ok(UserDataResult {
        user_found: true,
        profile_found: false,
        needs_registration: false,
        needs_profile: true,
        message: "Profile not found".to_string(),
      });
    }

    Ok(UserDataResult {
      user_found: true,
      profile_found: true,
      needs_registration: false,
      needs_profile: false,
      message: "Data synced successfully".to_string(),
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
