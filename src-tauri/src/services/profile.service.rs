/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/// ProfileService - Handles profile-specific sync operations
/// Note: CRUD operations are handled by CrudService via manageData endpoint
/// This service only handles profile-specific cloud sync operations
#[derive(Clone)]
pub struct ProfileService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl ProfileService {
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      jsonProvider: jsonProvider.clone(),
      mongodbProvider: jsonProvider.jsonSync.mongodbProvider.clone(),
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
      .get("profiles", &profileId)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Profile not found: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    // Check if profile exists in MongoDB
    match mongodbProvider
      .mongodbCrud
      .get("profiles", &profileId)
      .await
    {
      Ok(existingVal) => {
        // Update if cloud profile is older
        if shouldUpdateCloud(&profileData, &existingVal) {
          mongodbProvider
            .mongodbCrud
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
      Err(_) => {
        // Create new in cloud
        mongodbProvider
          .mongodbCrud
          .create("profiles", profileData)
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
      .getAll("profiles", Some(serde_json::json!({ "userId": userId })))
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting profiles: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    for profileData in profiles {
      let _ = mongodbProvider
        .mongodbCrud
        .create("profiles", profileData.clone())
        .await;
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
