/* sys lib */
use mongodb::bson::Document;
use serde_json::Value;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  profile_model::{ProfileFullModel, ProfileModel},
  response::{DataValue, ResponseModel, ResponseStatus},
};

#[allow(non_snake_case)]
pub struct ProfileService {
  pub mongodbProvider: MongodbProvider,
}

impl ProfileService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    let list_profiles = self
      .mongodbProvider
      .get_all::<ProfileFullModel>("profiles", None, None)
      .await;
    match list_profiles {
      Ok(profiles) => {
        let profiles: Vec<Value> = profiles
          .into_iter()
          .map(|profile| serde_json::to_value(&profile).unwrap())
          .collect();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(profiles),
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
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let profile = self
      .mongodbProvider
      .get_by_field::<ProfileFullModel>("profiles", None, None, &id.as_str())
      .await;
    match profile {
      Ok(profile) => {
        let profile: Value = serde_json::to_value(&profile).unwrap();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(profile),
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
  pub async fn create(&self, data: ProfileModel) -> Result<ResponseModel, ResponseModel> {
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let profile = self
      .mongodbProvider
      .create::<ProfileModel>("profiles", data)
      .await;
    match profile {
      Ok(_) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::String("".to_string()),
        });
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
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let profile = self
      .mongodbProvider
      .update::<ProfileModel>("profiles", &id.as_str(), data)
      .await;
    match profile {
      Ok(_) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::String("".to_string()),
        });
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
    let profile = self
      .mongodbProvider
      .delete::<ProfileModel>("profiles", &id.as_str())
      .await;
    match profile {
      Ok(_) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::String("".to_string()),
        });
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
