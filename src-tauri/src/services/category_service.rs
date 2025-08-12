/* sys lib */
use mongodb::bson::Document;

/* helpers */
use crate::helpers::common::{convert_data_to_array, convert_data_to_object};
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  category_model::{CategoryCreateModel, CategoryModel},
  response::{DataValue, ResponseModel, ResponseStatus},
};

#[allow(non_snake_case)]
pub struct CategoriesService {
  pub mongodbProvider: MongodbProvider,
}

impl CategoriesService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    let list_categories = self.mongodbProvider.get_all("categories", None, None).await;
    match list_categories {
      Ok(categories) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_array(&categories),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of categories! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let category = self
      .mongodbProvider
      .get_by_field("categories", None, None, &id.as_str())
      .await;
    match category {
      Ok(category) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&category),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: CategoryCreateModel) -> Result<ResponseModel, ResponseModel> {
    let model_data: CategoryModel = data.into();
    let document: Document = mongodb::bson::to_document(&model_data).unwrap();
    let category = self.mongodbProvider.create("categories", document).await;
    match category {
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
          message: format!("Couldn't create a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: CategoryModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let category = self
      .mongodbProvider
      .update("categories", &id.as_str(), document)
      .await;
    match category {
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
          message: format!("Couldn't update a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let category = self
      .mongodbProvider
      .delete("categories", &id.as_str())
      .await;
    match category {
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
          message: format!("Couldn't delete a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
