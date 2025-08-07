/* sys lib */
use mongodb::bson::Document;
use serde_json::Value;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  task_model::TaskModel,
};

#[allow(non_snake_case)]
pub struct TaskService {
  pub mongodbProvider: MongodbProvider,
}

impl TaskService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    let list_tasks = self.mongodbProvider.get_all("tasks").await;
    match list_tasks {
      Ok(tasks) => {
        let tasks: Vec<Value> = tasks
          .into_iter()
          .map(|task| serde_json::to_value(&task).unwrap())
          .collect();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(tasks),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of tasks! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let task = self.mongodbProvider.get_by_id("tasks", &id.as_str()).await;
    match task {
      Ok(task) => {
        let task: Value = serde_json::to_value(&task).unwrap();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(task),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a task! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskModel) -> Result<ResponseModel, ResponseModel> {
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let task = self.mongodbProvider.create("tasks", data).await;
    match task {
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
          message: format!("Couldn't create a task! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(&self, id: String, data: TaskModel) -> Result<ResponseModel, ResponseModel> {
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let task = self
      .mongodbProvider
      .update("tasks", &id.as_str(), data)
      .await;
    match task {
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
          message: format!("Couldn't update a task! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let task = self.mongodbProvider.delete("tasks", &id.as_str()).await;
    match task {
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
          message: format!("Couldn't delete a task! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
