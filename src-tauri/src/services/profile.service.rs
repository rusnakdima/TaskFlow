/* sys lib */
use mongodb::bson::{doc, to_bson, Bson, Document};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  mongodb_provider::MongodbProvider,
};

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel, ProfileUpdateModel},
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

#[allow(non_snake_case)]
pub struct ProfileService {
  pub mongodbProvider: MongodbProvider,
  relations: Vec<RelationObj>,
}

impl ProfileService {
  #[allow(non_snake_case)]
  pub fn new(mongodbProvider: MongodbProvider) -> Self {
    Self {
      mongodbProvider: mongodbProvider,
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
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = if nameField != "" {
      let mut doc = Document::new();
      doc.insert(nameField, value);
      Some(doc)
    } else {
      None
    };
    let listProfiles = self
      .mongodbProvider
      .getAllByField("profiles", filter, Some(self.relations.clone()))
      .await;
    match listProfiles {
      Ok(profiles) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&profiles),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of profiles! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = if nameField != "" {
      let mut doc = Document::new();
      doc.insert(nameField, value);
      Some(doc)
    } else {
      None
    };
    let profile = self
      .mongodbProvider
      .getByField("profiles", filter, Some(self.relations.clone()), &"")
      .await;
    match profile {
      Ok(profile) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToObject(&profile),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a profile! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: ProfileCreateModel) -> Result<ResponseModel, ResponseModel> {
    let userId = data.userId.clone();
    let findByUserId = self.getByField("userId".to_string(), userId.clone()).await;
    if findByUserId.is_ok() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Profile already exists!".to_string(),
        data: DataValue::String("".to_string()),
      });
    }

    let modelData: ProfileModel = data.into();
    let record = match to_bson(&modelData) {
      Ok(Bson::Document(doc)) => doc,
      Ok(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Error serializing profile: not a document".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error serializing profile: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    let profile = self.mongodbProvider.create("profiles", record).await;
    match profile {
      Ok(result) => {
        if result {
          let updateResult = self
            .mongodbProvider
            .update("users", &userId, doc! { "profileId": modelData.id })
            .await;
          match updateResult {
            Ok(_) => {
              return Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "".to_string(),
                data: DataValue::String("".to_string()),
              });
            }
            Err(updateError) => {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: format!(
                  "Profile created but failed to update user: {}",
                  updateError.to_string()
                ),
                data: DataValue::String("".to_string()),
              });
            }
          }
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a profile!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't create a profile! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: ProfileUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let modelData: ProfileModel = data.into();
    let record = match to_bson(&modelData) {
      Ok(Bson::Document(doc)) => doc,
      Ok(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Error serializing profile: not a document".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error serializing profile: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    let profile = self
      .mongodbProvider
      .update("profiles", &id.as_str(), record)
      .await;
    match profile {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't update a profile!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't update a profile! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let profile = self.mongodbProvider.delete("profiles", &id.as_str()).await;
    match profile {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't delete a profile!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't delete a profile! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
