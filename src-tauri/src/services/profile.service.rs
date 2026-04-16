/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/// ProfileService - Handles profile-specific sync operations
/// Note: CRUD operations are handled by RepositoryService via manageData endpoint
/// This service only handles profile-specific cloud sync operations
#[derive(Clone)]
pub struct ProfileService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
}

impl ProfileService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  /// Sync a single profile to MongoDB (create or update)
  /// Call this after creating/updating via manageData endpoint
  pub async fn syncProfileToCloud(
    &self,
    profileId: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: "MongoDB not available".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    let profileData = self
      .jsonProvider
      .find_by_id("profiles", &profileId)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Profile not found: {}", e),
        data: DataValue::String("".to_string()),
      })?
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "Profile not found".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    // Check if profile exists in MongoDB
    match mongodbProvider.find_by_id("profiles", &profileId).await {
      Ok(Some(existingVal)) => {
        // Update if cloud profile is older
        if shouldUpdateCloud(&profileData, &existingVal) {
          mongodbProvider
            .update("profiles", &profileId, profileData)
            .await
            .map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error updating profile in cloud: {}", e),
              data: DataValue::String("".to_string()),
            })?;

          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Profile updated in cloud".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Cloud profile is already up to date".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Ok(None) => {
        // Create new in cloud
        mongodbProvider
          .insert("profiles", profileData)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating profile in cloud: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Profile created in cloud".to_string(),
          data: DataValue::String("".to_string()),
        })
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error checking profile in cloud: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Sync all profiles for a user to MongoDB
  pub async fn syncAllProfilesForUser(
    &self,
    userId: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: "MongoDB not available".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    let profiles = self
      .jsonProvider
      .find_all("profiles")
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting profiles: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    for profileData in profiles {
      if let Some(userIdField) = profileData.get("userId").and_then(|v| v.as_str()) {
        if userIdField == userId {
          let _ = mongodbProvider
            .insert("profiles", profileData.clone())
            .await;
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "All profiles synced to cloud".to_string(),
      data: DataValue::String("".to_string()),
    })
  }
}

/// Compare timestamps to determine if cloud should be updated
fn shouldUpdateCloud(local: &Value, cloud: &Value) -> bool {
  let local_updated = local
    .get("updatedAt")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let cloud_updated = cloud
    .get("updatedAt")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  local_updated > cloud_updated
}
