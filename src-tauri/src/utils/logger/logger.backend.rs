use log::{LevelFilter, Log, Metadata, Record};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

const MAX_LOG_FILES: usize = 7;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LogEntry {
  pub level: String,
  pub component: String,
  pub message: String,
  pub timestamp: String,
}

pub struct AppLogger {
  level: LevelFilter,
  file: Mutex<Option<File>>,
  current_file_path: Mutex<Option<PathBuf>>,
  app_name: String,
  app_handle: Mutex<Option<AppHandle>>,
}

impl AppLogger {
  pub fn new(level: LevelFilter, app_name: &str) -> Self {
    let log_dir = Self::get_log_directory(app_name);
    let (file, file_path) = Self::open_log_file(&log_dir, app_name);

    if let Some(ref dir) = log_dir {
      Self::cleanup_old_logs(dir, MAX_LOG_FILES);
    }

    Self {
      level,
      file: Mutex::new(file),
      current_file_path: Mutex::new(file_path),
      app_name: app_name.to_string(),
      app_handle: Mutex::new(None),
    }
  }

  pub fn with_app_handle(mut self, app_handle: AppHandle) -> Self {
    *self.app_handle.lock().unwrap() = Some(app_handle);
    self
  }

  fn get_log_directory(app_name: &str) -> Option<PathBuf> {
    Some(
      dirs::data_local_dir()?
        .join(app_name.to_lowercase())
        .join("logs"),
    )
  }

  fn open_log_file(log_dir: &Option<PathBuf>, app_name: &str) -> (Option<File>, Option<PathBuf>) {
    let Some(dir) = log_dir else {
      return (None, None);
    };
    let _ = std::fs::create_dir_all(dir);

    let log_file = dir.join(format!(
      "{}_{}.log",
      app_name.to_lowercase(),
      chrono::Local::now().format("%Y-%m-%d")
    ));

    let file = OpenOptions::new()
      .create(true)
      .append(true)
      .open(&log_file)
      .ok();

    (file, Some(log_file))
  }

  fn should_rotate(&self) -> bool {
    if let Ok(guard) = self.current_file_path.lock() {
      if let Some(ref path) = *guard {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        return !path.to_string_lossy().contains(&today);
      }
    }
    false
  }

  fn rotate_if_needed(&self) {
    if !self.should_rotate() {
      return;
    }

    let log_dir = Self::get_log_directory(&self.app_name);
    let (new_file, new_path) = Self::open_log_file(&log_dir, &self.app_name);

    if let Ok(mut guard) = self.file.lock() {
      *guard = new_file;
    }
    if let Ok(mut guard) = self.current_file_path.lock() {
      *guard = new_path;
    }
  }

  fn cleanup_old_logs(log_dir: &PathBuf, max_files: usize) {
    let Ok(entries) = std::fs::read_dir(log_dir) else {
      return;
    };

    let mut log_files: Vec<_> = entries
      .filter_map(|e| e.ok())
      .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("log"))
      .collect();

    log_files.sort_by(|a, b| {
      b.metadata()
        .and_then(|m| m.modified())
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        .cmp(
          &a.metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        )
    });

    for entry in log_files.into_iter().skip(max_files) {
      let _ = std::fs::remove_file(entry.path());
    }
  }

  fn write_to_file(&self, msg: &str) {
    self.rotate_if_needed();
    if let Ok(mut guard) = self.file.lock() {
      if let Some(ref mut f) = *guard {
        let _ = f.write_all(msg.as_bytes());
        let _ = f.flush();
      }
    }
  }

  fn emit_to_frontend(&self, entry: &LogEntry) {
    if let Ok(guard) = self.app_handle.lock() {
      if let Some(ref handle) = *guard {
        let _ = handle.emit("app-log", entry.clone());
      }
    }
  }

  pub fn log_from_frontend(&self, level: &str, component: &str, message: &str) {
    let timestamp = chrono::Local::now()
      .format("%Y-%m-%d %H:%M:%S%.3f")
      .to_string();

    let entry = LogEntry {
      level: level.to_uppercase(),
      component: component.to_string(),
      message: message.to_string(),
      timestamp: timestamp.clone(),
    };

    let msg = format!(
      "[{}] [{}] [{}] {}\n",
      timestamp, entry.level, component, message
    );

    eprint!("{}", msg);
    self.write_to_file(&msg);
    self.emit_to_frontend(&entry);
  }
}

impl Log for AppLogger {
  fn enabled(&self, metadata: &Metadata) -> bool {
    metadata.level() <= self.level
  }

  fn log(&self, record: &Record) {
    if record.level() > self.level {
      return;
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let msg = format!(
      "[{}] [{}] [{}] {}\n",
      timestamp,
      record.level(),
      record.target(),
      record.args()
    );

    eprint!("{}", msg);
    self.write_to_file(&msg);
  }

  fn flush(&self) {
    if let Ok(mut guard) = self.file.lock() {
      if let Some(ref mut f) = *guard {
        let _ = f.flush();
      }
    }
  }
}

static LOGGER: Mutex<Option<AppLogger>> = Mutex::new(None);

pub fn set_global_logger(logger: AppLogger) {
  *LOGGER.lock().unwrap() = Some(logger);
}

pub fn log_from_frontend_global(level: &str, component: &str, message: &str) {
  if let Ok(guard) = LOGGER.lock() {
    if let Some(ref logger) = *guard {
      logger.log_from_frontend(level, component, message);
    }
  }
}

pub unsafe fn init_log_system(
  app_name: &str,
  level: LevelFilter,
) -> Result<(), log::SetLoggerError> {
  let logger = AppLogger::new(level, app_name);
  set_global_logger(logger);
  log::set_max_level(LevelFilter::Trace);
  Ok(())
}

pub fn init_log_system_with_handle(
  app_name: &str,
  level: LevelFilter,
  app_handle: AppHandle,
) -> Result<(), log::SetLoggerError> {
  let logger = AppLogger::new(level, app_name).with_app_handle(app_handle);
  set_global_logger(logger);
  log::set_max_level(LevelFilter::Trace);
  Ok(())
}
