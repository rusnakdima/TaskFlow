/* sys lib */
use dotenv::dotenv;
use std::env;
use std::fs::File;
use std::io::Write;

use tauri::Manager;
use tauri_plugin_http::reqwest;

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

pub struct AboutService;

impl AboutService {
  pub fn new() -> Self {
    Self
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
    dotenv().ok();

    let mut nameApp = env::var("NAME_APP").expect("NAME_APP not set");
    if cfg!(target_os = "linux") {
      nameApp = nameApp.to_string();
    } else if cfg!(target_os = "windows") {
      nameApp = format!("{}.exe", nameApp);
    } else if cfg!(target_os = "macos") {
      nameApp = format!("{}.app", nameApp);
    } else if cfg!(target_os = "android") {
      nameApp = format!("{}.apk", nameApp);
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
      data: DataValue::String(nameApp),
    });
  }
}
