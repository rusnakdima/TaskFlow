/* sys lib */
use mongodb::bson::{doc, Document};

/* helpers */
use crate::helpers::common::{convert_data_to_array, convert_data_to_object};
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  task_model::{TaskCreateModel, TaskModel},
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
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let listTasks = self
      .mongodbProvider
      .getAllByField(
        "tasks",
        if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        },
        None,
      )
      .await;
    match listTasks {
      Ok(tasks) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_array(&tasks),
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
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let task = self
      .mongodbProvider
      .getByField(
        "tasks",
        if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        },
        None,
        "",
      )
      .await;
    match task {
      Ok(task) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&task),
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
  pub async fn create(&self, data: TaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    let modelData: TaskModel = data.into();
    let document: Document = mongodb::bson::to_document(&modelData).unwrap();
    let task = self.mongodbProvider.create("tasks", document).await;
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
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let task = self
      .mongodbProvider
      .update("tasks", &id.as_str(), document)
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
