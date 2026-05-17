#![allow(non_snake_case)]

use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};
use crate::services::about_service::AboutService;
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_http::reqwest;
use tauri_plugin_shell::ShellExt;
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn getBinaryNameFile(
  state: State<'_, AppState>,
  version: String,
) -> Result<ResponseModel, String> {
  state
    .about_service
    .get_binary_name_file(version)
    .await
    .map_err(|e| e.message)
}

#[tauri::command]
pub async fn downloadUpdate(
  url: String,
  file_name: String,
  app_handle: AppHandle,
  window: tauri::Window,
) -> Result<ResponseModel, String> {
  let mut response = reqwest::get(&url)
    .await
    .map_err(|e| format!("Download failed: {}", e))?;

  let total_size = response.content_length().unwrap_or(0);
  let mut downloaded: u64 = 0;

  let download_dir = app_handle
    .path()
    .download_dir()
    .map_err(|e| format!("Failed to get download directory: {}", e))?;

  let file_path = download_dir.join(&file_name);
  let mut file = tokio::fs::File::create(&file_path)
    .await
    .map_err(|e| format!("Failed to create file: {}", e))?;

  loop {
    match response.chunk().await {
      Ok(Some(chunk)) => {
        file
          .write_all(&chunk)
          .await
          .map_err(|e| format!("Write failed: {}", e))?;

        downloaded += chunk.len() as u64;

        if total_size > 0 {
          let percent = (downloaded as f64 / total_size as f64 * 100.0) as u32;
          let _ = window.emit("download-progress", percent);
        }
      }
      Ok(None) => break,
      Err(e) => {
        return Err(format!("Download failed: {}", e));
      }
    }
  }

  file
    .flush()
    .await
    .map_err(|e| format!("Flush failed: {}", e))?;

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "".to_string(),
    data: DataValue::String(file_path.display().to_string()),
  })
}

#[tauri::command]
pub async fn openFile(path: String) -> Result<ResponseModel, String> {
  AboutService::open_file(path).await.map_err(|e| e.message)
}

#[tauri::command]
pub async fn installUpdate(
  installer_path: String,
  app_handle: AppHandle,
) -> Result<ResponseModel, String> {
  let path = std::path::Path::new(&installer_path);
  if !path.exists() {
    return Err("Installer file not found".to_string());
  }

  let extension = path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_lowercase();

  #[cfg(target_os = "windows")]
  {
    let shell = app_handle.shell();
    if extension == "msi" {
      let _child = shell
        .command("msiexec")
        .args(["/i", &installer_path])
        .spawn()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    } else {
      let _child = shell
        .command(&installer_path)
        .spawn()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    }
  }

  #[cfg(target_os = "macos")]
  {
    let shell = app_handle.shell();
    let _child = shell
      .command("open")
      .args(["-W", &installer_path])
      .spawn()
      .map_err(|e| format!("Failed to open installer: {}", e))?;
  }

  #[cfg(target_os = "linux")]
  {
    let shell = app_handle.shell();
    if extension == "AppImage" {
      let _child = shell
        .command("chmod")
        .args(["+x", &installer_path])
        .spawn()
        .map_err(|e| format!("Failed to make executable: {}", e))?;
      let _child = shell
        .command(&installer_path)
        .spawn()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    } else if extension == "deb" {
      let _child = shell
        .command("dpkg")
        .args(["-i", &installer_path])
        .spawn()
        .map_err(|e| format!("Failed to install .deb: {}", e))?;
    } else if extension == "rpm" {
      let _child = shell
        .command("rpm")
        .args(["-U", &installer_path])
        .spawn()
        .map_err(|e| format!("Failed to install .rpm: {}", e))?;
    } else {
      return Err(format!("Unsupported installer format: {}", extension));
    }
  }

  Ok(ResponseModel {
    status: ResponseStatus::Success,
    message: "Installer started successfully".to_string(),
    data: DataValue::Bool(true),
  })
}

#[tauri::command]
pub fn getCurrentVersion() -> String {
  env!("CARGO_PKG_VERSION").to_string()
}
