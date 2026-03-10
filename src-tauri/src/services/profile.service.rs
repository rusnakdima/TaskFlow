/* sys lib */
use serde_json::{json, to_value, Value};
use std::sync::Arc;

/* helpers */
use crate::helpers::common::convertDataToArray;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* services */
use crate::services::profile_sync_service::ProfileSyncService;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel, ProfileUpdateModel},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

use crate::helpers::user_sync_helper;

#[derive(Clone)]
pub struct ProfileService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub profileSyncService: Option<ProfileSyncService>,
}

impl ProfileService {
  pub fn new(jsonProvider: JsonProvider) -> Self {
    let mongodbProvider = jsonProvider.jsonSync.mongodbProvider.clone();
    let profileSyncService = match &mongodbProvider {
      Some(mongodbProvider) => Some(ProfileSyncService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
      )),
      None => None,
    };

    Self {
      jsonProvider,
      mongodbProvider,
      profileSyncService,
    }
  }

  pub async fn getAll(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    let listProfiles = self.jsonProvider.getAll("profiles", Some(filter)).await;
    match listProfiles {
      Ok(profiles) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToArray(&profiles),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a list of profiles! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    match self.jsonProvider.get("profiles", &id).await {
      Ok(profile) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: DataValue::Object(profile),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn getByUserId(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    // Get all profiles filtered by userId
    let filter = json!({ "userId": userId });
    match self.jsonProvider.getAll("profiles", Some(filter)).await {
      Ok(profiles) => {
        if profiles.is_empty() {
          // Return empty profile if not found
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Profile not found, returning empty profile".to_string(),
            data: DataValue::Object(json!({
              "id": "",
              "name": "",
              "lastName": "",
              "bio": "",
              "imageUrl": "",
              "userId": userId,
              "createdAt": "",
              "updatedAt": ""
            })),
          })
        } else {
          // Return first matching profile
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::Object(profiles[0].clone()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a profile by userId! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn create(&self, profile: ProfileCreateModel) -> Result<ResponseModel, ResponseModel> {
    let userId = profile.userId.clone();
    let modelData: ProfileModel = profile.into();
    let profileId = modelData.id.clone();

    match to_value(&modelData) {
      Ok(value) => {
        match self.jsonProvider.create("profiles", value.clone()).await {
          Ok(_) => {
            if let Some(ref syncService) = self.profileSyncService {
              let _ = syncService.syncProfileToCloud(value).await;
            }

            // Update user with profileId in both MongoDB and local JSON
            user_sync_helper::updateUserProfileId(
              &self.jsonProvider,
              &self.mongodbProvider,
              &userId,
              &profileId,
            )
            .await?;

            Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "Profile created successfully".to_string(),
              data: DataValue::String("".to_string()),
            })
          }
          Err(error) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Couldn't create a profile! {}", error.to_string()),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't serialize a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn update(&self, profile: ProfileUpdateModel) -> Result<ResponseModel, ResponseModel> {
    let profileId = profile.id.clone();

    match self.jsonProvider.get("profiles", &profileId).await {
      Ok(existingProfile) => {
        let mut updatedProfile: ProfileModel = serde_json::from_value(existingProfile).unwrap();

        if let Some(name) = profile.name {
          updatedProfile.name = name;
        }
        if let Some(lastName) = profile.lastName {
          updatedProfile.lastName = lastName;
        }
        if let Some(bio) = profile.bio {
          updatedProfile.bio = bio;
        }
        if let Some(imageUrl) = profile.imageUrl {
          updatedProfile.imageUrl = imageUrl;
        }

        updatedProfile.updatedAt =
          chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        match to_value(&updatedProfile) {
          Ok(value) => {
            match self
              .jsonProvider
              .update("profiles", &profileId, value.clone())
              .await
            {
              Ok(_) => {
                if let Some(ref syncService) = self.profileSyncService {
                  let _ = syncService.syncProfileToCloud(value).await;
                }

                Ok(ResponseModel {
                  status: ResponseStatus::Success,
                  message: "Profile updated successfully".to_string(),
                  data: DataValue::String("".to_string()),
                })
              }
              Err(error) => Err(ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Couldn't update a profile! {}", error.to_string()),
                data: DataValue::String("".to_string()),
              }),
            }
          }
          Err(error) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Couldn't serialize a profile! {}", error.to_string()),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Profile not found! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    match self.jsonProvider.hardDelete("profiles", &id).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Profile deleted successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't delete a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
