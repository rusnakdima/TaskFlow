use log::{debug, error, info, warn, LevelFilter};

pub use crate::utils::logger::logger_backend::{init_log_system, init_log_system_with_handle};

pub fn init_logger(app_name: &str, level: LevelFilter) -> Result<(), log::SetLoggerError> {
  unsafe { init_log_system(app_name, level) }
}

#[inline]
pub fn log_debug(message: &str) {
  debug!("{}", message);
}

#[inline]
pub fn log_warn(message: &str) {
  warn!("{}", message);
}

#[inline]
pub fn log_error(message: &str) {
  error!("{}", message);
}

#[inline]
pub fn log_info(message: &str) {
  info!("{}", message);
}
