/* imports */
mod controllers;
mod helpers;
mod models;
mod services;

use controllers::about::{download_update, get_binary_name_file};
use controllers::auth::{login, register};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      get_binary_name_file,
      download_update,
      login,
      register,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
