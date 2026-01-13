/* sys lib */
use serde_json::{json, to_value, Value};
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
  mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::profile_sync_service::ProfileSyncService;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel, ProfileUpdateModel},
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct ProfileService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub profileSyncService: Option<ProfileSyncService>,
  relations: Vec<RelationObj>,
}

impl ProfileService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    let mongodbProvider = jsonProvider.mongodbProvider.clone();
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
      relations: vec![RelationObj {
        nameTable: "users".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "userId".to_string(),
        newNameField: "user".to_string(),
        relations: None,
      }],
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    let listProfiles = self
      .jsonProvider
      .getAllByField("profiles", Some(filter), None)
      .await;
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

  #[allow(non_snake_case)]
  pub async fn getByField(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    let profile = self
      .jsonProvider
      .getByField("profiles", Some(filter), Some(self.relations.clone()), "")
      .await;
    match profile {
      Ok(profile) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToObject(&profile),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: ProfileCreateModel) -> Result<ResponseModel, ResponseModel> {
    let userId = data.userId.clone();
    let findByUserId = self.getByField(json!({ "userId": userId.clone() })).await;
    if findByUserId.is_ok() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Profile already exists!".to_string(),
        data: DataValue::String("".to_string()),
      });
    }

    let modelData: ProfileModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let profile = self.jsonProvider.create("profiles", record).await;
    match profile {
      Ok(result) => {
        if result {
          if let Some(ref syncService) = self.profileSyncService {
            let _ = syncService.syncProfileToCloud(modelData.clone()).await;
          }

          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a profile!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: ProfileUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let profile = self
      .jsonProvider
      .getByField("profiles", None, None, id.as_str())
      .await;

    match profile {
      Ok(profile) => {
        let existingProfileResult: Result<ProfileModel, _> =
          serde_json::from_value::<ProfileModel>(profile.clone());
        let existingProfile = match existingProfileResult {
          Ok(profile) => profile,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to parse existing profile data".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let now = chrono::Local::now();
        let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false);

        let updatedProfile = ProfileModel {
          _id: existingProfile._id,
          id: existingProfile.id,
          name: if data.name != existingProfile.name {
            data.name
          } else {
            existingProfile.name
          },
          lastName: if data.lastName != existingProfile.lastName {
            data.lastName
          } else {
            existingProfile.lastName
          },
          bio: if data.bio != existingProfile.bio {
            data.bio
          } else {
            existingProfile.bio
          },
          imageUrl: if data.imageUrl != existingProfile.imageUrl {
            data.imageUrl
          } else {
            existingProfile.imageUrl
          },
          userId: if data.userId != existingProfile.userId {
            data.userId
          } else {
            existingProfile.userId
          },
          createdAt: existingProfile.createdAt,
          updatedAt: formatted,
        };

        let record: Value = match to_value(&updatedProfile) {
          Ok(val) => val,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to serialize updated profile".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let updateResult = self
          .jsonProvider
          .update("profiles", &id.as_str(), record)
          .await;

        match updateResult {
          Ok(success) => {
            if success {
              if let Some(ref syncService) = self.profileSyncService {
                let _ = syncService.syncProfileToCloud(updatedProfile.clone()).await;
              }

              Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Profile updated successfully".to_string(),
                data: DataValue::String("".to_string()),
              })
            } else {
              Ok(ResponseModel {
                status: ResponseStatus::Error,
                message: "Couldn't update a profile!".to_string(),
                data: DataValue::String("".to_string()),
              })
            }
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
        message: format!("Couldn't get a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let profile = self.jsonProvider.delete("profiles", &id.as_str()).await;
    match profile {
      Ok(result) => {
        if result {
          if let Some(ref mongodbProvider) = self.mongodbProvider {
            let _ = mongodbProvider.delete("profiles", &id.as_str()).await;
          }

          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't delete a profile!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't delete a profile! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
