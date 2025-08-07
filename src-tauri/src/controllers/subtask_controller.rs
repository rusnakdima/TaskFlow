/* services */
use crate::services::subtask_service;

/* models */
use crate::models::{response::ResponseModel, subtask_model::SubtaskModel};

#[allow(non_snake_case)]
pub struct SubtaskController {
  pub subtaskService: subtask_service::SubtaskService,
}

impl SubtaskController {
  pub fn new() -> Self {
    return Self {
      subtaskService: subtask_service::SubtaskService::new(),
    };
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.get_all().await;
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.get(id).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: SubtaskModel) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.delete(id).await;
  }
}
