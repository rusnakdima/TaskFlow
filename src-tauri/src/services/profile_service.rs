/* sys lib */
use mongodb::bson::{doc, Document};
use serde_json::Value;

/* helpers */
use crate::helpers::mongodb_provider::{MongodbProvider, RelationObj, TypesField};

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel},
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
    let relations: Vec<RelationObj> = vec![RelationObj {
      collection_name: "users".to_string(),
      typeField: TypesField::One,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      relations: None,
    }];

    let list_profiles = self
      .mongodbProvider
      .get_all("profiles", None, Some(relations))
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
  pub async fn get_by_user_id(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let relations: Vec<RelationObj> = vec![RelationObj {
      collection_name: "users".to_string(),
      typeField: TypesField::One,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      relations: None,
    }];

    let profile = self
      .mongodbProvider
      .get_by_field(
        "profiles",
        Some(doc! {"userId": userId}),
        Some(relations),
        &"",
      )
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
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let relations: Vec<RelationObj> = vec![RelationObj {
      collection_name: "users".to_string(),
      typeField: TypesField::One,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      relations: None,
    }];

    let profile = self
      .mongodbProvider
      .get_by_field("profiles", None, Some(relations), &id.as_str())
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
  pub async fn create(&self, data: ProfileCreateModel) -> Result<ResponseModel, ResponseModel> {
    let find_by_user_id = self.get_by_user_id(data.userId.clone()).await;
    if find_by_user_id.is_ok() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Profile already exists!".to_string(),
        data: DataValue::String("".to_string()),
      });
    }

    let model_data: ProfileModel = data.into();
    let doc: Document = mongodb::bson::to_document(&model_data).unwrap();
    let profile = self.mongodbProvider.create("profiles", doc).await;
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
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let profile = self
      .mongodbProvider
      .update("profiles", &id.as_str(), document)
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
    let profile = self.mongodbProvider.delete("profiles", &id.as_str()).await;
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
