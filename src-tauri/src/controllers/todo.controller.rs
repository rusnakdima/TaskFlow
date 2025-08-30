/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::todo_service;

/* models */
use crate::models::{
  response_model::ResponseModel,
  todo_model::{TodoCreateModel, TodoUpdateModel},
};

#[allow(non_snake_case)]
pub struct TodoController {
  pub todoService: todo_service::TodoService,
}

impl TodoController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      todoService: todo_service::TodoService::new(jsonProvider),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.getAllByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TodoCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TodoUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.delete(id).await;
  }
}
