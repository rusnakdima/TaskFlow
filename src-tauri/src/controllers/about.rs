/* services */
use crate::services::about;

/* models */
use crate::models::response::Response;

#[tauri::command]
pub async fn download_update(
  app_handle: tauri::AppHandle,
  url: String,
  file_name: String,
) -> Response {
  return about::download_file(app_handle, url, file_name).await;
}

#[tauri::command]
pub async fn get_binary_name_file() -> Response {
  return about::get_binary_name_file().await;
}
