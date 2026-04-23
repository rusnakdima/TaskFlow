/* sys lib */
use tokio::io::AsyncWriteExt;

use tauri::{Emitter, Manager};
use tauri_plugin_http::reqwest;

use open;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

pub struct AboutService {
  pub name_app: String,
}

impl AboutService {
  pub fn new(env_value: String) -> Self {
    Self {
      name_app: env_value,
    }
  }

  pub async fn download_file(
    &self,
    window: &tauri::Window,
    app_handle: tauri::AppHandle,
    url: String,
    file_name: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut response = reqwest::get(&url).await.map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Download failed: {}", e),
      data: DataValue::String("".to_string()),
    })?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let download_dir = app_handle
      .path()
      .download_dir()
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Failed to get download directory: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    let file_path = download_dir.join(&file_name);
    let mut file = tokio::fs::File::create(&file_path)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Failed to create file: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    loop {
      match response.chunk().await {
        Ok(Some(chunk)) => {
          file.write_all(&chunk).await.map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Write failed: {}", e),
            data: DataValue::String("".to_string()),
          })?;

          downloaded += chunk.len() as u64;

          if total_size > 0 {
            let percent = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            let _ = window.emit("download-progress", percent);
          }
        }
        Ok(None) => break,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Download failed: {}", e),
            data: DataValue::String("".to_string()),
          })
        }
      }
    }

    file.flush().await.map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Flush failed: {}", e),
      data: DataValue::String("".to_string()),
    })?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::String(file_path.display().to_string()),
    })
  }

  pub async fn get_binary_name_file(
    &self,
    version: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let name_app = if cfg!(target_os = "linux") {
      format!("{}_{}_amd64.AppImage", self.name_app, version)
    } else if cfg!(target_os = "windows") {
      format!("{}_{}_x64-setup.exe", self.name_app, version)
    } else if cfg!(target_os = "macos") {
      format!("{}_{}_aarch64.dmg", self.name_app, version)
    } else if cfg!(target_os = "android") {
      "app-universal-release.apk".to_string()
    } else {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Unsupported target platform".to_string(),
        data: DataValue::String("".to_string()),
      });
    };

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::String(name_app),
    })
  }

  pub async fn open_file(&self, path: String) -> Result<ResponseModel, ResponseModel> {
    match open::that(&path) {
      Ok(()) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "File opened successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Failed to open file: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
