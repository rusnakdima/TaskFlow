/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
};

#[allow(non_snake_case)]
pub struct TaskService {
  pub jsonProvider: JsonProvider,
  relations: Vec<RelationObj>,
}

impl TaskService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      jsonProvider: jsonProvider,
      relations: vec![RelationObj {
        nameTable: "subtasks".to_string(),
        typeField: TypesField::OneToMany,
        nameField: "taskId".to_string(),
        newNameField: "subtasks".to_string(),
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
    let listTasks = self
      .jsonProvider
      .getAllByField(
        "tasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
      )
      .await;
    match listTasks {
      Ok(tasks) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&tasks),
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
      .jsonProvider
      .getByField(
        "tasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
        "",
      )
      .await;
    match task {
      Ok(task) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToObject(&task),
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
    let record: Value = to_value(&modelData).unwrap();
    let task = self.jsonProvider.create("tasks", record).await;
    match task {
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
            message: "Couldn't create a task!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
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
  pub async fn update(
    &self,
    id: String,
    data: TaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let modelData: TaskModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let task = self
      .jsonProvider
      .update("tasks", &id.as_str(), record)
      .await;
    match task {
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
            message: "Couldn't update a task!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
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
    let task = self.jsonProvider.delete("tasks", &id.as_str()).await;
    match task {
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
            message: "Couldn't delete a task!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
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
