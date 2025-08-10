/* sys lib */
use mongodb::bson::Document;
use serde_json::Value;

/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  todo_model::{TodoFullModel, TodoModel},
};

#[allow(non_snake_case)]
pub struct TodoService {
  pub mongodbProvider: MongodbProvider,
}

impl TodoService {
  pub fn new() -> Self {
    Self {
      mongodbProvider: MongodbProvider::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    let list_todos = self
      .mongodbProvider
      .get_all::<TodoFullModel>("todos", None, None)
      .await;
    match list_todos {
      Ok(todos) => {
        let todos: Vec<Value> = todos
          .into_iter()
          .map(|todo| serde_json::to_value(&todo).unwrap())
          .collect();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(todos),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of todos! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let todo = self
      .mongodbProvider
      .get_by_field::<TodoFullModel>("todos", None, None, &id.as_str())
      .await;
    match todo {
      Ok(todo) => {
        let todo: Value = serde_json::to_value(&todo).unwrap();
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(todo),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TodoModel) -> Result<ResponseModel, ResponseModel> {
    data = {
      ..data;
      _id = ObjectId::new();
      id = Uuid::new().to_string();
    };
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let todo = self
      .mongodbProvider
      .create::<TodoModel>("todos", data)
      .await;
    match todo {
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
          message: format!("Couldn't create a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(&self, id: String, data: TodoModel) -> Result<ResponseModel, ResponseModel> {
    let data: Document = mongodb::bson::to_document(&data).unwrap();
    let todo = self
      .mongodbProvider
      .update::<TodoModel>("todos", &id.as_str(), data)
      .await;
    match todo {
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
          message: format!("Couldn't update a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let todo = self
      .mongodbProvider
      .delete::<TodoModel>("todos", &id.as_str())
      .await;
    match todo {
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
          message: format!("Couldn't delete a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
