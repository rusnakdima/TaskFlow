/* sys lib */
use mongodb::bson::{doc, Document};

use crate::helpers::common::{convert_data_to_array, convert_data_to_object};
/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response::{DataValue, ResponseModel, ResponseStatus},
  todo_model::{TodoCreateModel, TodoModel},
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
  pub async fn getAll(&self) -> Result<ResponseModel, ResponseModel> {
    let list_todos = self.mongodbProvider.getAll("todos", None, None).await;
    match list_todos {
      Ok(todos) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_array(&todos),
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
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let todo = self
      .mongodbProvider
      .getByField("todos", Some(doc! { nameField: value }), None, "")
      .await;
    match todo {
      Ok(todo) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&todo),
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
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let todo = self
      .mongodbProvider
      .getByField("todos", None, None, &id.as_str())
      .await;
    match todo {
      Ok(todo) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convert_data_to_object(&todo),
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
  pub async fn create(&self, data: TodoCreateModel) -> Result<ResponseModel, ResponseModel> {
    let model_data: TodoModel = data.into();
    let document: Document = mongodb::bson::to_document(&model_data).unwrap();
    let todo = self.mongodbProvider.create("todos", document).await;
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
    let document: Document = mongodb::bson::to_document(&data).unwrap();
    let todo = self
      .mongodbProvider
      .update("todos", &id.as_str(), document)
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
    let todo = self.mongodbProvider.delete("todos", &id.as_str()).await;
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
