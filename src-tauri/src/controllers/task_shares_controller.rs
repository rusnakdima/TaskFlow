/* services */
use crate::services::task_shares_service;

/* models */
use crate::models::{
  response::ResponseModel,
  task_shares_model::{TaskSharesCreateModel, TaskSharesModel},
};

#[allow(non_snake_case)]
pub struct TaskSharesController {
  pub taskSharesService: task_shares_service::TaskSharesService,
}

impl TaskSharesController {
  pub fn new() -> Self {
    return Self {
      taskSharesService: task_shares_service::TaskSharesService::new(),
    };
  }

  #[allow(non_snake_case)]
  pub async fn getAll(&self) -> Result<ResponseModel, ResponseModel> {
    return self.taskSharesService.getAll().await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.taskSharesService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.taskSharesService.get(id).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskSharesCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.taskSharesService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TaskSharesModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.taskSharesService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.taskSharesService.delete(id).await;
  }
}
