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
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
}

impl ProfileService {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  /// Sync a single profile to MongoDB (create or update)
  /// Call this after creating/updating via manageData endpoint
  pub async fn sync_profile_to_cloud(
    &self,
    profile_id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongodb_provider = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let profile_data = self
      .json_provider
      .find_by_id("profiles", &profile_id)
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
    match mongodb_provider.find_by_id("profiles", &profile_id).await {
      Ok(Some(existing_val)) => {
        // Update if cloud profile is older
        if should_update_cloud(&profile_data, &existing_val) {
          mongodb_provider
            .update("profiles", &profile_id, profile_data)
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
        mongodb_provider
          .insert("profiles", profile_data)
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
  pub async fn sync_all_profiles_for_user(
    &self,
    user_id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongodb_provider = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let profiles = self
      .json_provider
      .find_all("profiles")
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting profiles: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    for profile_data in profiles {
      if let Some(user_id_field) = profile_data.get("user_id").and_then(|v| v.as_str()) {
        if user_id_field == user_id {
          let _ = mongodb_provider
            .insert("profiles", profile_data.clone())
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

  pub async fn create_profile_with_user_update(
    &self,
    profile_data: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    use crate::entities::table_entity::validate_model;
    use crate::helpers::response_helper::{err_response, err_response_formatted, success_response};
    use crate::helpers::user_sync_helper;

    let validated_profile = validate_model("profiles", &profile_data, true)
      .map_err(|e| err_response_formatted("Profile validation failed", &e))?;

    let user_id = validated_profile
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if user_id.is_empty() {
      return Err(err_response("Invalid profile data: userId is required"));
    }

    if let Ok(existing_profiles) = self.json_provider.find_all("profiles").await {
      for profile in existing_profiles {
        if profile.get("user_id").and_then(|v| v.as_str()) == Some(&user_id) {
          return Ok(success_response(DataValue::Object(profile)));
        }
      }
    }

    let created_profile = self
      .json_provider
      .insert("profiles", validated_profile.clone())
      .await
      .map_err(|e| {
        err_response_formatted("Error creating profile in local store", &e.to_string())
      })?;

    let profile_id = created_profile
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if let Err(e) = user_sync_helper::update_user_profile_id_both(
      &self.json_provider,
      self.mongodb_provider.as_ref(),
      &user_id,
      &profile_id,
    )
    .await
    {
      return Err(e);
    }

    // Sync profile to MongoDB if available (non-blocking)
    if self.mongodb_provider.is_some() {
      let _ = self.sync_profile_to_cloud(profile_id).await;
    }

    Ok(success_response(DataValue::Object(created_profile)))
  }
}

/// Compare timestamps to determine if cloud should be updated
fn should_update_cloud(local: &Value, cloud: &Value) -> bool {
  let local_updated = local
    .get("updated_at")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let cloud_updated = cloud
    .get("updated_at")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  local_updated > cloud_updated
}
