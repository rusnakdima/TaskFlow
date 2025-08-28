/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel},
  relation_obj_models::{RelationObj, TypesField},
  response::{DataValue, ResponseModel, ResponseStatus},
};

#[allow(non_snake_case)]
pub struct ProfileService {
  pub jsonProvider: JsonProvider,
  relations: Vec<RelationObj>,
}

impl ProfileService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      jsonProvider: jsonProvider,
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
    let listProfiles = self
      .jsonProvider
      .getAllByField(
        "profiles",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
      )
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
    let profile = self
      .jsonProvider
      .getByField(
        "profiles",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
        &"",
      )
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
    let findByUserId = self
      .getByField("userId".to_string(), data.userId.clone())
      .await;
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
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
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
    data: ProfileModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let record: Value = to_value(&data).unwrap();
    let profile = self
      .jsonProvider
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
    let profile = self.jsonProvider.delete("profiles", &id.as_str()).await;
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
