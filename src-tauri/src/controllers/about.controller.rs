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
    window: &tauri::Window,
    appHandle: tauri::AppHandle,
    url: String,
    fileName: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .aboutService
      .downloadFile(window, appHandle, url, fileName)
      .await
  }

  #[allow(non_snake_case)]
  pub async fn getBinaryNameFile(&self, version: String) -> Result<ResponseModel, ResponseModel> {
    self.aboutService.getBinaryNameFile(version).await
  }

  #[allow(non_snake_case)]
  pub async fn openFile(&self, path: String) -> Result<ResponseModel, ResponseModel> {
    self.aboutService.openFile(path).await
  }
}
