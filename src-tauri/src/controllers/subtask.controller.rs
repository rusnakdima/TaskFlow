/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::subtask_service;

/* models */
use crate::models::{
  response_model::ResponseModel,
  subtask_model::{SubtaskCreateModel, SubtaskUpdateModel},
};

#[allow(non_snake_case)]
pub struct SubtaskController {
  pub subtaskService: subtask_service::SubtaskService,
}

impl SubtaskController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    return Self {
      subtaskService: subtask_service::SubtaskService::new(jsonProvider),
    };
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.getAllByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: SubtaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.delete(id).await;
  }
}
