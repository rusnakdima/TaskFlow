/* sys lib */
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  profile_model::ProfileModel,
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

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

  pub async fn syncProfileToCloud(&self, profile: ProfileModel) -> Result<bool, ResponseModel> {
    let value: Value = match serde_json::to_value(&profile) {
      Ok(v) => v,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting profile to value: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let mut valueClone = value.clone();
    if let Some(obj) = valueClone.as_object_mut() {
      obj.remove("_id");
    }

    let doc: Document = match from_bson(to_bson(&valueClone).map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Error converting value to bson: {}", e),
      data: DataValue::String("".to_string()),
    })?) {
      Ok(doc) => doc,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting bson to document: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    match self
      .mongodbProvider
      .get("profiles", None, None, &profile.id)
      .await
    {
      Ok(existingDoc) => {
        let existingVal = match serde_json::to_value(&existingDoc) {
          Ok(v) => v,
          Err(e) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting existing document to value: {}", e),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let shouldUpdate = self.shouldUpdateTarget(&value, &existingVal);

        if shouldUpdate {
          match self
            .mongodbProvider
            .update("profiles", &profile.id, doc)
            .await
          {
            Ok(success) => Ok(success),
            Err(e) => Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error updating profile in cloud: {}", e),
              data: DataValue::String("".to_string()),
            }),
          }
        } else {
          Ok(true)
        }
      }
      Err(_) => match self.mongodbProvider.create("profiles", doc).await {
        Ok(success) => Ok(success),
        Err(e) => Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error creating profile in cloud: {}", e),
          data: DataValue::String("".to_string()),
        }),
      },
    }
  }

  pub async fn syncProfileFromCloud(&self, profileId: &str) -> Result<bool, ResponseModel> {
    match self
      .mongodbProvider
      .get("profiles", None, None, profileId)
      .await
    {
      Ok(cloudDoc) => {
        let value = match serde_json::to_value(&cloudDoc) {
          Ok(v) => v,
          Err(e) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting cloud document to value: {}", e),
              data: DataValue::String("".to_string()),
            });
          }
        };

        match self
          .jsonProvider
          .get("profiles", None, None, profileId)
          .await
        {
          Ok(localVal) => {
            let shouldUpdate = self.shouldUpdateTarget(&value, &localVal);

            if shouldUpdate {
              match self.jsonProvider.update("profiles", profileId, value).await {
                Ok(success) => Ok(success),
                Err(e) => Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: format!("Error updating local profile: {}", e),
                  data: DataValue::String("".to_string()),
                }),
              }
            } else {
              Ok(true)
            }
          }
          Err(_) => match self.jsonProvider.create("profiles", value).await {
            Ok(success) => Ok(success),
            Err(e) => Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error creating local profile: {}", e),
              data: DataValue::String("".to_string()),
            }),
          },
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting profile from cloud: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  fn shouldUpdateTarget(&self, source: &Value, target: &Value) -> bool {
    let sourceUpdatedAt = source.get("updatedAt").and_then(|v| v.as_str());
    let targetUpdatedAt = target.get("updatedAt").and_then(|v| v.as_str());

    match (sourceUpdatedAt, targetUpdatedAt) {
      (Some(s), Some(t)) => s > t,
      _ => true,
    }
  }

  pub async fn syncAllProfilesForUser(&self, userId: &str) -> Result<ResponseModel, ResponseModel> {
    let localProfiles = match self
      .jsonProvider
      .getAll(
        "profiles",
        Some(serde_json::json!({ "userId": userId })),
        None,
      )
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

    for profileValue in localProfiles {
      if let Some(_profileId) = profileValue.get("id").and_then(|v| v.as_str()) {
        match serde_json::from_value::<ProfileModel>(profileValue.clone()) {
          Ok(profile) => if let Err(_) = self.syncProfileToCloud(profile).await {},
          Err(_) => {}
        }
      }
    }

    let cloudProfiles = match self
      .mongodbProvider
      .getAll("profiles", Some(doc! { "userId": userId }), None)
      .await
    {
      Ok(profiles) => profiles,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting cloud profiles: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    for profileDoc in cloudProfiles {
      if let Ok(profileId) = profileDoc.get_str("id") {
        if let Err(_) = self.syncProfileFromCloud(profileId).await {}
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Profile synchronization completed".to_string(),
      data: DataValue::String("".to_string()),
    })
  }
}
