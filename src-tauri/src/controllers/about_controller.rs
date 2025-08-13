/* services */
use crate::services::about_service;

/* models */
use crate::models::response::ResponseModel;

#[allow(non_snake_case)]
pub struct AboutController {
  pub aboutService: about_service::AboutService,
}

impl AboutController {
  pub fn new() -> Self {
    Self {
      aboutService: about_service::AboutService::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn downloadUpdate(
    &self,
    app_handle: tauri::AppHandle,
    url: String,
    file_name: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self
      .aboutService
      .downloadFile(app_handle, url, file_name)
      .await;
  }

  #[allow(non_snake_case)]
  pub async fn getBinaryNameFile(&self) -> Result<ResponseModel, ResponseModel> {
    return self.aboutService.getBinaryNameFile().await;
  }
}
