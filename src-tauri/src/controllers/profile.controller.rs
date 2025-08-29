/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::profile_service;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel},
  response_model::ResponseModel,
};

#[allow(non_snake_case)]
pub struct ProfileController {
  pub profileService: profile_service::ProfileService,
}

impl ProfileController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    return Self {
      profileService: profile_service::ProfileService::new(jsonProvider),
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
    data: ProfileModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.delete(id).await;
  }
}
