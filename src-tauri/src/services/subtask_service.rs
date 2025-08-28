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
  subtask_model::{SubtaskCreateModel, SubtaskModel},
};

#[allow(non_snake_case)]
pub struct SubtaskService {
  pub jsonProvider: JsonProvider,
}

impl SubtaskService {
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
    let listSubtasks = self
      .jsonProvider
      .getAllByField(
        "subtasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
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
          data: convertDataToArray(&subtasks),
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
      .jsonProvider
      .getByField(
        "subtasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
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
          data: convertDataToObject(&subtask),
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
    let record: Value = to_value(&modelData).unwrap();
    let subtask = self.jsonProvider.create("subtasks", record).await;
    match subtask {
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
            message: "Couldn't create a subtask!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
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
    let record: Value = to_value(&data).unwrap();
    let subtask = self
      .jsonProvider
      .update("subtasks", &id.as_str(), record)
      .await;
    match subtask {
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
            message: "Couldn't update a subtask!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
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
    let subtask = self.jsonProvider.delete("subtasks", &id.as_str()).await;
    match subtask {
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
            message: "Couldn't delete a subtask!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
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
