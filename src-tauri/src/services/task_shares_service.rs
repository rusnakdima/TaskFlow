/* sys lib */
use mongodb::bson::Document;
use serde_json::Value;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  task_shares_model::TaskSharesModel,
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
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    let list_task_shares = self.mongodbProvider.get_all("task_shares").await;
    match list_task_shares {
      Ok(task_shares) => {
        let task_shares: Vec<Value> = task_shares
          .into_iter()
          .map(|task_share| serde_json::to_value(&task_share).unwrap())
          .collect();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(task_shares),
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
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let task_share = self
      .mongodbProvider
      .get_by_id("task_shares", &id.as_str())
      .await;
    match task_share {
      Ok(task_share) => {
        let task_share: Value = serde_json::to_value(&task_share).unwrap();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(task_share),
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
  pub async fn create(&self, data: TaskSharesModel) -> Result<ResponseModel, ResponseModel> {
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let task_share = self.mongodbProvider.create("task_shares", data).await;
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
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let task_share = self
      .mongodbProvider
      .update("task_shares", &id.as_str(), data)
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
