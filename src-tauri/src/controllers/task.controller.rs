/* sys lib */
use std::sync::Arc;

/* helpers */
use crate::helpers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* services */
use crate::services::{
  daily_activity_service::DailyActivityService, task_service::TaskService,
  todo_service::TodoService,
};

/* models */
use crate::models::{
  response_model::ResponseModel,
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
};

#[allow(non_snake_case)]
pub struct TaskController {
  pub taskService: TaskService,
  pub todoService: TodoService,
  pub dailyActivityService: DailyActivityService,
}

impl TaskController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    dailyActivityService: DailyActivityService,
  ) -> Self {
    Self {
      taskService: TaskService::new(
        jsonProvider.clone(),
        TodoService::new(
          jsonProvider.clone(),
          mongodbProvider.clone(),
          dailyActivityService.clone(),
        ),
        dailyActivityService.clone(),
      ),
      todoService: TodoService::new(jsonProvider, mongodbProvider, dailyActivityService.clone()),
      dailyActivityService,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.getAllByField(nameField, value).await
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.getByField(nameField, value).await
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    self.taskService.createAndLog(data).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.updateAndLog(id, data).await
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<TaskModel>) -> Result<ResponseModel, ResponseModel> {
    self.taskService.updateAll(data).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    self.taskService.deleteAndLog(id).await
  }
}
