/* sys lib */
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::{
  subtask_service::SubtaskService, task_service::TaskService, todo_service::TodoService,
};

/* models */
use crate::models::{
  response_model::ResponseModel,
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
};

#[allow(non_snake_case)]
pub struct SubtaskController {
  pub subtaskService: SubtaskService,
  pub taskService: TaskService,
  pub todoService: TodoService,
  pub activityLogHelper: ActivityLogHelper,
}

impl SubtaskController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    let todoService = TodoService::new(
      jsonProvider.clone(),
      mongodbProvider.clone(),
      activityLogHelper.clone(),
    );
    let taskService = TaskService::new(
      jsonProvider.clone(),
      todoService.clone(),
      activityLogHelper.clone(),
    );

    Self {
      subtaskService: SubtaskService::new(
        jsonProvider.clone(),
        taskService.clone(),
        todoService.clone(),
        activityLogHelper.clone(),
      ),
      taskService,
      todoService,
      activityLogHelper,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.getAllByField(nameField, value).await
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.getByField(nameField, value).await
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: SubtaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.create(data).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.update(id, data).await
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<SubtaskModel>) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.updateAll(data).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.delete(id).await
  }
}
