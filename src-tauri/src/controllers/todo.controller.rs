/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::{daily_activity_service::DailyActivityService, todo_service::TodoService};

/* models */
use crate::models::{
  response_model::ResponseModel,
  todo_model::{TodoCreateModel, TodoUpdateModel},
};

#[allow(non_snake_case)]
pub struct TodoController {
  pub todoService: TodoService,
  pub dailyActivityService: DailyActivityService,
}

impl TodoController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider, dailyActivityService: DailyActivityService) -> Self {
    Self {
      todoService: TodoService::new(jsonProvider, dailyActivityService.clone()),
      dailyActivityService,
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
    return self.todoService.createAndLog(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TodoUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.updateAndLog(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.deleteAndLog(id).await;
  }
}
