/* helpers */
use crate::helpers::json_provider::JsonProvider;
use serde_json::Value;

/* services */
use crate::services::profile_service::ProfileService;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileUpdateModel},
  response_model::ResponseModel,
};

#[allow(non_snake_case)]
pub struct ProfileController {
  pub profileService: ProfileService,
}

impl ProfileController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      profileService: ProfileService::new(jsonProvider),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAll(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    self.profileService.getAll(filter).await
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    self.profileService.get(filter).await
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: ProfileCreateModel) -> Result<ResponseModel, ResponseModel> {
    self.profileService.create(data).await
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: ProfileUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    self.profileService.update(id, data).await
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    self.profileService.delete(id).await
  }
}
