/* sys lib */
use serde_json::Value;
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
  sync_metadata_model::SyncMetadata,
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
      mongodbProvider.clone(),
      todoService.clone(),
      activityLogHelper.clone(),
    );

    Self {
      subtaskService: SubtaskService::new(
        jsonProvider.clone(),
        mongodbProvider.clone(),
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
    filter: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .subtaskService
      .getAllByField(filter, syncMetadata)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    filter: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.getByField(filter, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn create(
    &self,
    data: SubtaskCreateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.create(data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskUpdateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.update(id, data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(
    &self,
    data: Vec<SubtaskModel>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.updateAll(data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    id: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.subtaskService.delete(id, syncMetadata).await
  }
}
