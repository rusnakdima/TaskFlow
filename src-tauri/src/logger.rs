use log::{LevelFilter, Log, Metadata, Record};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppLogger {
  level: LevelFilter,
  file: Mutex<Option<File>>,
  log_dir: PathBuf,
}

impl AppLogger {
  pub fn new(log_dir: PathBuf) -> Self {
    Self {
      level: LevelFilter::Info,
      file: Mutex::new(None),
      log_dir,
    }
  }

  pub fn init(&self) {
    std::fs::create_dir_all(&self.log_dir).ok();
    let log_file = self.log_dir.join(format!(
      "taskflow_{}.log",
      chrono::Local::now().format("%Y%m%d")
    ));
    let file = OpenOptions::new()
      .create(true)
      .append(true)
      .open(&log_file)
      .ok();
    *self.file.lock().unwrap() = file;
    let logger: &'static dyn Log = unsafe { &*(self as *const AppLogger as *const dyn Log) };
    log::set_logger(logger).unwrap();
    log::set_max_level(self.level);
  }
}

impl Log for AppLogger {
  fn log(&self, record: &Record) {
    if record.level() > self.level {
      return;
    }
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let msg = format!(
      "[{}] {} - {}: {}\n",
      timestamp,
      record.level(),
      record.target(),
      record.args()
    );
    eprint!("{}", msg);
    if let Ok(mut guard) = self.file.lock() {
      if let Some(ref mut f) = *guard {
        let _ = f.write_all(msg.as_bytes());
        let _ = f.flush();
      }
    }
  }

  fn enabled(&self, metadata: &Metadata) -> bool {
    metadata.level() <= self.level
  }

  fn flush(&self) {}
}

pub fn init_logger() {
  let log_dir = dirs::data_local_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join("taskflow")
    .join("logs");
  let logger = AppLogger::new(log_dir);
  logger.init();
}
