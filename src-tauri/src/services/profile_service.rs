/* sys lib */
use mongodb::bson::{doc, Document};

/* helpers */
use crate::helpers::common::{convert_data_to_array, convert_data_to_object};
use crate::helpers::mongodb_provider::{MongodbProvider, RelationObj, TypesField};

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel},
  response::{DataValue, ResponseModel, ResponseStatus},
};

#[allow(non_snake_case)]
pub struct ProfileService {
  pub mongodbProvider: MongodbProvider,
  relations: Vec<RelationObj>,
}

impl ProfileService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
      relations: vec![RelationObj {
        collection_name: "users".to_string(),
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
    let list_profiles = self
      .mongodbProvider
      .getAllByField(
        "profiles",
        if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        },
        Some(self.relations.clone()),
      )
      .await;
    match list_profiles {
      Ok(profiles) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_array(&profiles),
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
      .mongodbProvider
      .getByField(
        "profiles",
        if nameField != "" {
          Some(doc! { nameField: value })
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
          data: convert_data_to_object(&profile),
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
    let find_by_user_id = self
      .getByField("userId".to_string(), data.userId.clone())
      .await;
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
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let profile = self
      .mongodbProvider
      .update("profiles", &id.as_str(), document)
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
