/* services */
use crate::services::task_service;

/* models */
use crate::models::{
  response::ResponseModel,
  task_model::{TaskCreateModel, TaskModel},
};

#[allow(non_snake_case)]
pub struct TaskController {
  pub taskService: task_service::TaskService,
}

impl TaskController {
  pub fn new() -> Self {
    Self {
      taskService: task_service::TaskService::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.taskService.getAllByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.taskService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.taskService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(&self, id: String, data: TaskModel) -> Result<ResponseModel, ResponseModel> {
    return self.taskService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.taskService.delete(id).await;
  }
}
