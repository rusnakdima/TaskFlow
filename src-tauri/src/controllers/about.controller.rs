/* services */
use crate::services::about_service;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
pub struct AboutController {
  pub aboutService: about_service::AboutService,
}

impl AboutController {
  #[allow(non_snake_case)]
  pub fn new(envValue: String) -> Self {
    Self {
      aboutService: about_service::AboutService::new(envValue),
    }
  }

  #[allow(non_snake_case)]
  pub async fn downloadUpdate(
    &self,
    app_handle: tauri::AppHandle,
    url: String,
    file_name: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .aboutService
      .downloadFile(app_handle, url, file_name)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn getBinaryNameFile(&self) -> Result<ResponseModel, ResponseModel> {
    self.aboutService.getBinaryNameFile().await
  }
}
