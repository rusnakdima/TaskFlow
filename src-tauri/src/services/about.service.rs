/* sys lib */
use tokio::io::AsyncWriteExt;

use tauri::{Emitter, Manager};
use tauri_plugin_http::reqwest;

use open;

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
    window: &tauri::Window,
    appHandle: tauri::AppHandle,
    url: String,
    fileName: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut response = reqwest::get(&url).await.map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Download failed: {}", e),
      data: DataValue::String("".to_string()),
    })?;

    let totalSize = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let downloadDir = appHandle.path().download_dir().map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Failed to get download directory: {}", e),
      data: DataValue::String("".to_string()),
    })?;

    let filePath = downloadDir.join(&fileName);
    let mut file = tokio::fs::File::create(&filePath)
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

          if totalSize > 0 {
            let percent = (downloaded as f64 / totalSize as f64 * 100.0) as u32;
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
      data: DataValue::String(filePath.display().to_string()),
    })
  }

  #[allow(non_snake_case)]
  pub async fn getBinaryNameFile(&self, version: String) -> Result<ResponseModel, ResponseModel> {
    let _nameApp = if cfg!(target_os = "linux") {
      format!("{}_{}_amd64.AppImage", self.nameApp, version)
    } else if cfg!(target_os = "windows") {
      format!("{}_{}_x64-setup.exe", self.nameApp, version)
    } else if cfg!(target_os = "macos") {
      format!("{}_{}_aarch64.dmg", self.nameApp, version)
    } else if cfg!(target_os = "android") {
      "app-universal-release.apk".to_string()
    } else {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Unsupported target platform".to_string(),
        data: DataValue::String("".to_string()),
      });
    };

    return Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::String(_nameApp),
    });
  }

  #[allow(non_snake_case)]
  pub async fn openFile(&self, path: String) -> Result<ResponseModel, ResponseModel> {
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
