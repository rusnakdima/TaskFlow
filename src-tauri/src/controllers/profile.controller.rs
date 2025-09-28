/* helpers */
use crate::helpers::mongodb_provider::MongodbProvider;

/* services */
use crate::services::profile_service;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileUpdateModel},
  response_model::ResponseModel,
};

/* sys */
use std::sync::Arc;

#[allow(non_snake_case)]
pub struct ProfileController {
  pub profileService: profile_service::ProfileService,
}

impl ProfileController {
  #[allow(non_snake_case)]
  pub fn new(mongodbProvider: Arc<MongodbProvider>) -> Self {
    return Self {
      profileService: profile_service::ProfileService::new(mongodbProvider),
    };
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.getAllByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: ProfileCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: ProfileUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.delete(id).await;
  }
}
