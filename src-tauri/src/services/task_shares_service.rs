/* sys lib */
use mongodb::bson::{doc, Document};

/* helpers */
use crate::helpers::common::{convert_data_to_array, convert_data_to_object};
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  task_shares_model::{TaskSharesCreateModel, TaskSharesModel},
};

#[allow(non_snake_case)]
pub struct TaskSharesService {
  pub mongodbProvider: MongodbProvider,
}

impl TaskSharesService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAll(&self) -> Result<ResponseModel, ResponseModel> {
    let list_task_shares = self.mongodbProvider.getAll("task_shares", None, None).await;
    match list_task_shares {
      Ok(task_shares) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_array(&task_shares),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of task_shares! {}", error.to_string()),
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
    let task_share = self
      .mongodbProvider
      .getByField(
        "task_shares",
        Some(doc! { nameField: value }),
        None,
        "",
      )
      .await;
    match task_share {
      Ok(task_share) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&task_share),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a task_share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let task_share = self
      .mongodbProvider
      .getByField("task_shares", None, None, &id.as_str())
      .await;
    match task_share {
      Ok(task_share) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&task_share),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a task_share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskSharesCreateModel) -> Result<ResponseModel, ResponseModel> {
    let model_data: TaskSharesModel = data.into();
    let document: Document = mongodb::bson::to_document(&model_data).unwrap();
    let task_share = self.mongodbProvider.create("task_shares", document).await;
    match task_share {
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
          message: format!("Couldn't create a task_share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TaskSharesModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let task_share = self
      .mongodbProvider
      .update("task_shares", &id.as_str(), document)
      .await;
    match task_share {
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
          message: format!("Couldn't update a task_share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let task_share = self
      .mongodbProvider
      .delete("task_shares", &id.as_str())
      .await;
    match task_share {
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
          message: format!("Couldn't delete a task_share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
