/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::{task_service::TaskService, todo_service::TodoService};

/* models */
use crate::models::{
  response_model::ResponseModel,
  sync_metadata_model::SyncMetadata,
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
};

#[allow(non_snake_case)]
pub struct TaskController {
  pub taskService: TaskService,
  pub todoService: TodoService,
  pub activityLogHelper: ActivityLogHelper,
}

impl TaskController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      taskService: TaskService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
        TodoService::new(
          jsonProvider.clone(),
          mongodbProvider.clone(),
          activityLogHelper.clone(),
        ),
        activityLogHelper.clone(),
      ),
      todoService: TodoService::new(jsonProvider, mongodbProvider, activityLogHelper.clone()),
      activityLogHelper,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAll(
    &self,
    filter: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.getAll(filter, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn get(
    &self,
    filter: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.get(filter, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn create(
    &self,
    data: TaskCreateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.create(data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TaskUpdateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.update(id, data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(
    &self,
    data: Vec<TaskModel>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.updateAll(data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    id: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.taskService.delete(id, syncMetadata).await
  }
}
