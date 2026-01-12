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
  sync_metadata_model::SyncMetadata,
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
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .todoService
      .getAllByField(nameField, value, syncMetadata)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .todoService
      .getByField(nameField, value, syncMetadata)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn getByAssignee(
    &self,
    assigneeId: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .todoService
      .getByAssignee(assigneeId, syncMetadata)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn create(
    &self,
    data: TodoCreateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.create(data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TodoUpdateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.update(id, data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(
    &self,
    data: Vec<TodoModel>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.updateAll(data, syncMetadata).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    id: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.todoService.delete(id, syncMetadata).await
  }
}
