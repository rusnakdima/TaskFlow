/* sys lib */
use mongodb::bson::Document;
use serde_json::Value;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  subtask_model::{SubtaskCreateModel, SubtaskModel},
};

#[allow(non_snake_case)]
pub struct SubtaskService {
  pub mongodbProvider: MongodbProvider,
}

impl SubtaskService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    let list_subtasks = self.mongodbProvider.get_all("subtasks", None, None).await;
    match list_subtasks {
      Ok(subtasks) => {
        let subtasks: Vec<Value> = subtasks
          .into_iter()
          .map(|subtask| serde_json::to_value(&subtask).unwrap())
          .collect();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(subtasks),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of subtasks! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let subtask = self
      .mongodbProvider
      .get_by_field("subtasks", None, None, &id.as_str())
      .await;
    match subtask {
      Ok(subtask) => {
        let subtask: Value = serde_json::to_value(&subtask).unwrap();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(subtask),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a subtask! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: SubtaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    let model_data: SubtaskModel = data.into();
    let document: Document = mongodb::bson::to_document(&model_data).unwrap();
    let subtask = self.mongodbProvider.create("subtasks", document).await;
    match subtask {
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
          message: format!("Couldn't create a subtask! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let subtask = self
      .mongodbProvider
      .update("subtasks", &id.as_str(), document)
      .await;
    match subtask {
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
          message: format!("Couldn't update a subtask! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let subtask = self.mongodbProvider.delete("subtasks", &id.as_str()).await;
    match subtask {
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
          message: format!("Couldn't delete a subtask! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
