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

  pub async fn download_update(
    &self,
    app_handle: tauri::AppHandle,
    url: String,
    file_name: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self
      .aboutService
      .download_file(app_handle, url, file_name)
      .await;
  }

  pub async fn get_binary_name_file(&self) -> Result<ResponseModel, ResponseModel> {
    return self.aboutService.get_binary_name_file().await;
  }
}
