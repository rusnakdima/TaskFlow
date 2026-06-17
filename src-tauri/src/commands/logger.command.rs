use crate::utils::logger::logger_backend::log_from_frontend_global;
use crate::utils::logger::{log_debug, log_error, log_info, log_warn};
use tauri::command;

#[command]
pub fn log_message(level: &str, component: &str, message: &str) -> Result<(), String> {
  log_from_frontend_global(level, component, message);
  match level.to_lowercase().as_str() {
    "debug" => log_debug(&format!("[{}] {}", component, message)),
    "warn" => log_warn(&format!("[{}] {}", component, message)),
    "error" => log_error(&format!("[{}] {}", component, message)),
    "info" => log_info(&format!("[{}] {}", component, message)),
    _ => log_info(&format!("[{}] {}", component, message)),
  }
  Ok(())
}
