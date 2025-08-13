/* sys lib */
use mongodb::bson::{doc, Document};

/* helpers */
use crate::helpers::common::{convert_data_to_array, convert_data_to_object};
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
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let listSubtasks = self
      .mongodbProvider
      .getAllByField(
        "subtasks",
        if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        },
        None,
      )
      .await;
    match listSubtasks {
      Ok(subtasks) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_array(&subtasks),
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
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let subtask = self
      .mongodbProvider
      .getByField(
        "subtasks",
        if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        },
        None,
        "",
      )
      .await;
    match subtask {
      Ok(subtask) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&subtask),
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
    let modelData: SubtaskModel = data.into();
    let document: Document = mongodb::bson::to_document(&modelData).unwrap();
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
