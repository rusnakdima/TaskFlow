/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  task_shares_model::{TaskSharesCreateModel, TaskSharesModel},
};

#[allow(non_snake_case)]
pub struct TaskSharesService {
  pub jsonProvider: JsonProvider,
}

impl TaskSharesService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      jsonProvider: jsonProvider,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let listTaskShares = self
      .jsonProvider
      .getAllByField(
        "task_shares",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        None,
      )
      .await;
    match listTaskShares {
      Ok(task_shares) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&task_shares),
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
    let taskShare = self
      .jsonProvider
      .getByField(
        "task_shares",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        None,
        "",
      )
      .await;
    match taskShare {
      Ok(taskShare) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToObject(&taskShare),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a task share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskSharesCreateModel) -> Result<ResponseModel, ResponseModel> {
    let modelData: TaskSharesModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let taskShare = self.jsonProvider.create("task_shares", record).await;
    match taskShare {
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
            message: "Couldn't create a task share!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't create a task share! {}", error.to_string()),
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
    let record: Value = to_value(&data).unwrap();
    let taskShare = self
      .jsonProvider
      .update("task_shares", &id.as_str(), record)
      .await;
    match taskShare {
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
            message: "Couldn't update a task share!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't update a task share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let taskShare = self.jsonProvider.delete("task_shares", &id.as_str()).await;
    match taskShare {
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
            message: "Couldn't delete a task share!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't delete a task share! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
