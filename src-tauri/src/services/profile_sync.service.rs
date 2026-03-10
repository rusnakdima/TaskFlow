/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  profile_model::ProfileModel,
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

use crate::helpers::comparison_helper;

#[derive(Clone)]
pub struct ProfileSyncService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
}

impl ProfileSyncService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  pub async fn syncAllProfilesForUser(&self, userId: &str) -> Result<ResponseModel, ResponseModel> {
    let localProfiles = match self
      .jsonProvider
      .getAll("profiles", Some(serde_json::json!({ "userId": userId })))
      .await
    {
      Ok(profiles) => profiles,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting local profiles: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    for profileVal in localProfiles {
      if let Ok(profile) = serde_json::from_value::<ProfileModel>(profileVal.clone()) {
        let _ = self.syncProfileToCloud(profileVal).await;
        let _ = self.syncProfileFromCloud(&profile.id).await;
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Profile synchronization completed".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  pub async fn syncProfileToCloud(
    &self,
    profileData: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    let profile: ProfileModel =
      serde_json::from_value(profileData.clone()).map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Invalid profile data: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    match self.mongodbProvider.get("profiles", &profile.id).await {
      Ok(existingVal) => {
        if comparison_helper::shouldUpdateTarget(&profileData, &existingVal) {
          match self
            .mongodbProvider
            .update("profiles", &profile.id, profileData)
            .await
          {
            Ok(_) => Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Profile updated in cloud".to_string(),
              data: DataValue::String("".to_string()),
            }),
            Err(e) => Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error updating profile in cloud: {}", e),
              data: DataValue::String("".to_string()),
            }),
          }
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Cloud profile is already up to date".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(_) => match self.mongodbProvider.create("profiles", profileData).await {
        Ok(_) => Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Profile created in cloud".to_string(),
          data: DataValue::String("".to_string()),
        }),
        Err(e) => Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error creating profile in cloud: {}", e),
          data: DataValue::String("".to_string()),
        }),
      },
    }
  }

  pub async fn syncProfileFromCloud(
    &self,
    profileId: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    match self.mongodbProvider.get("profiles", profileId).await {
      Ok(cloudVal) => match self.jsonProvider.get("profiles", profileId).await {
        Ok(localVal) => {
          if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
            match self
              .jsonProvider
              .update("profiles", profileId, cloudVal)
              .await
            {
              Ok(_) => Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Profile updated from cloud".to_string(),
                data: DataValue::String("".to_string()),
              }),
              Err(e) => Err(ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error updating local profile: {}", e),
                data: DataValue::String("".to_string()),
              }),
            }
          } else {
            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Local profile is already up to date".to_string(),
              data: DataValue::String("".to_string()),
            })
          }
        }
        Err(_) => match self.jsonProvider.create("profiles", cloudVal).await {
          Ok(_) => Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Profile created from cloud".to_string(),
            data: DataValue::String("".to_string()),
          }),
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating local profile: {}", e),
            data: DataValue::String("".to_string()),
          }),
        },
      },
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Profile not found in cloud: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
