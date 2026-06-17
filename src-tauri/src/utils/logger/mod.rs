#[path = "logger.backend.rs"]
pub mod logger_backend;
#[path = "logger.service.rs"]
pub mod logger_service;

pub use logger_service::{init_logger, log_debug, log_error, log_info, log_warn};
