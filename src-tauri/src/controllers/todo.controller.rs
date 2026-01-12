/* sys lib */
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::todo_service::TodoService;

/* models */
use crate::models::{
  response_model::ResponseModel,
  todo_model::{TodoCreateModel, TodoModel, TodoUpdateModel},
};

#[allow(non_snake_case)]
pub struct TodoController {
  pub todoService: TodoService,
  pub activityLogHelper: ActivityLogHelper,
}

impl TodoController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      todoService: TodoService::new(jsonProvider, mongodbProvider, activityLogHelper.clone()),
      activityLogHelper,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.getAllByField(nameField, value).await
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.getByField(nameField, value).await
  }

  #[allow(non_snake_case)]
  pub async fn getByAssignee(&self, assigneeId: String) -> Result<ResponseModel, ResponseModel> {
    self.todoService.getByAssignee(assigneeId).await
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TodoCreateModel) -> Result<ResponseModel, ResponseModel> {
    self.todoService.create(data).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TodoUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.update(id, data).await
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<TodoModel>) -> Result<ResponseModel, ResponseModel> {
    self.todoService.updateAll(data).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    self.todoService.delete(id).await
  }
}
