/* sys lib */
use std::fs::File;
use std::io::Write;

use tauri::Manager;
use tauri_plugin_http::reqwest;

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

#[allow(non_snake_case)]
pub struct AboutService {
  pub nameApp: String,
}

impl AboutService {
  #[allow(non_snake_case)]
  pub fn new(envValue: String) -> Self {
    Self { nameApp: envValue }
  }

  #[allow(non_snake_case)]
  pub async fn downloadFile(
    &self,
    appHandle: tauri::AppHandle,
    url: String,
    fileName: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let response = reqwest::get(url).await;

    if response.is_err() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error: {:?}", response.unwrap_err()),
        data: DataValue::String("".to_string()),
      });
    }

    let downloadFolder = appHandle.path().download_dir();

    if downloadFolder.is_err() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!(
          "Error! Failed to get download folder: {}",
          downloadFolder.unwrap_err()
        ),
        data: DataValue::String("".to_string()),
      });
    }

    let filePath = downloadFolder.unwrap().join(&fileName);
    let file = File::create(&filePath);

    if file.is_err() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error! Failed to create file: {}", file.unwrap_err()),
        data: DataValue::String("".to_string()),
      });
    }

    let bytes = response.unwrap().bytes().await.unwrap();
    let _ = file.unwrap().write_all(&bytes);

    return Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::String(filePath.display().to_string()),
    });
  }

  #[allow(non_snake_case)]
  pub async fn getBinaryNameFile(&self) -> Result<ResponseModel, ResponseModel> {
    let mut _nameApp = self.nameApp.clone();
    if cfg!(target_os = "linux") {
      _nameApp = _nameApp;
    } else if cfg!(target_os = "windows") {
      _nameApp = format!("{}.exe", _nameApp);
    } else if cfg!(target_os = "macos") {
      _nameApp = format!("{}.app", _nameApp);
    } else if cfg!(target_os = "android") {
      _nameApp = format!("{}.apk", _nameApp);
    } else {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Unknown target platform".to_string(),
        data: DataValue::String("".to_string()),
      });
    }

    return Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::String(_nameApp),
    });
  }
}
