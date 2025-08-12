/* services */
use crate::services::profile_service;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileModel},
  response::ResponseModel,
};

#[allow(non_snake_case)]
pub struct ProfileController {
  pub profileService: profile_service::ProfileService,
}

impl ProfileController {
  pub fn new() -> Self {
    return Self {
      profileService: profile_service::ProfileService::new(),
    };
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.get_all().await;
  }

  #[allow(non_snake_case)]
  pub async fn get_by_user_id(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.get_by_user_id(userId).await;
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.profileService.get(id).await;
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
