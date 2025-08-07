/* sys lib */
use dotenv::dotenv;
use std::env;
use std::fs::File;
use std::io::Write;

use tauri::Manager;
use tauri_plugin_http::reqwest;

/* models */
use crate::models::response::{DataValue, ResponseModel, ResponseStatus};

pub struct AboutService;

impl AboutService {
  pub fn new() -> Self {
    Self
  }

  pub async fn download_file(
    &self,
    app_handle: tauri::AppHandle,
    url: String,
    file_name: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let response = reqwest::get(url).await;

    if response.is_err() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error: {:?}", response.unwrap_err()),
        data: DataValue::String("".to_string()),
      });
    }

    let download_folder = app_handle.path().download_dir();

    if download_folder.is_err() {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!(
          "Error! Failed to get download folder: {}",
          download_folder.unwrap_err()
        ),
        data: DataValue::String("".to_string()),
      });
    }

    let file_path = download_folder.unwrap().join(&file_name);
    let file = File::create(&file_path);

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
      data: DataValue::String(file_path.display().to_string()),
    });
  }

  pub async fn get_binary_name_file(&self) -> Result<ResponseModel, ResponseModel> {
    dotenv().ok();

    let mut _name_app = env::var("NAME_APP").expect("NAME_APP not set");
    if cfg!(target_os = "linux") {
      _name_app = _name_app.to_string();
    } else if cfg!(target_os = "windows") {
      _name_app = format!("{}.exe", _name_app);
    } else if cfg!(target_os = "macos") {
      _name_app = format!("{}.app", _name_app);
    } else if cfg!(target_os = "android") {
      _name_app = format!("{}.apk", _name_app);
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
      data: DataValue::String(_name_app),
    });
  }
}
