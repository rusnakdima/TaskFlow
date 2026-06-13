use chrono::Utc;
use log::{info, LevelFilter};
use serde_json::Value;
use std::env;
use std::sync::Once;
use std::time::Instant;

static INIT: Once = Once::new();

pub fn init() {
  INIT.call_once(|| {
    let enabled = env::var("RUST_LOG_ENABLED").unwrap_or_else(|_| "true".to_string());
    let debug = env::var("RUST_LOG_DEBUG").unwrap_or_else(|_| "false".to_string());
    let info = env::var("RUST_LOG_INFO").unwrap_or_else(|_| "false".to_string());
    let warn = env::var("RUST_LOG_WARN").unwrap_or_else(|_| "true".to_string());
    let error = env::var("RUST_LOG_ERROR").unwrap_or_else(|_| "true".to_string());

    let log_level = env::var("RUST_LOG").unwrap_or_else(|_| "debug".to_string());
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or(&log_level)).init();

    log::info!(
      "Logging initialized: enabled={}, debug={}, info={}, warn={}, error={}",
      enabled,
      debug,
      info,
      warn,
      error
    );
  });
}

pub struct LogContext {
  pub request_id: String,
  pub user_id: Option<String>,
  pub service: String,
  pub operation: String,
}

impl LogContext {
  pub fn new(service: &str, operation: &str) -> Self {
    Self {
      request_id: uuid::Uuid::new_v4().to_string(),
      user_id: None,
      service: service.to_string(),
      operation: operation.to_string(),
    }
  }

  pub fn with_user_id(mut self, user_id: &str) -> Self {
    self.user_id = Some(user_id.to_string());
    self
  }

  pub fn request_id(&self) -> &str {
    &self.request_id
  }

  pub fn user_id(&self) -> Option<&str> {
    self.user_id.as_deref()
  }
}

pub struct LogBuilder {
  level: String,
  service: String,
  operation: String,
  request_id: Option<String>,
  user_id: Option<String>,
  duration_ms: Option<u64>,
  data: Option<Value>,
  error: Option<String>,
}

impl LogBuilder {
  pub fn new(level: &str, service: &str, operation: &str) -> Self {
    Self {
      level: level.to_string(),
      service: service.to_string(),
      operation: operation.to_string(),
      request_id: None,
      user_id: None,
      duration_ms: None,
      data: None,
      error: None,
    }
  }

  pub fn request_id(mut self, request_id: &str) -> Self {
    self.request_id = Some(request_id.to_string());
    self
  }

  pub fn user_id(mut self, user_id: &str) -> Self {
    self.user_id = Some(user_id.to_string());
    self
  }

  pub fn duration_ms(mut self, ms: u64) -> Self {
    self.duration_ms = Some(ms);
    self
  }

  pub fn data(mut self, data: Value) -> Self {
    self.data = Some(data);
    self
  }

  pub fn error(mut self, err: &str) -> Self {
    self.error = Some(err.to_string());
    self
  }

  pub fn build(&self) -> String {
    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ");
    let mut parts = vec![format!(
      "{} {} service={} operation={}",
      timestamp, self.level, self.service, self.operation
    )];

    if let Some(ref rid) = self.request_id {
      parts.push(format!("request_id={}", rid));
    }
    if let Some(ref uid) = self.user_id {
      parts.push(format!("user_id={}", uid));
    }
    if let Some(ms) = self.duration_ms {
      parts.push(format!("duration_ms={}", ms));
    }
    if let Some(ref d) = self.data {
      if let Ok(s) = serde_json::to_string(d) {
        parts.push(format!("data={}", s));
      }
    }
    if let Some(ref e) = self.error {
      parts.push(format!("error={}", e));
    }

    parts.join(" ")
  }
}

pub fn log_info(ctx: &LogContext, msg: &str) {
  let log = LogBuilder::new("INFO", &ctx.service, &ctx.operation)
    .request_id(&ctx.request_id)
    .user_id(ctx.user_id.as_deref().unwrap_or(""))
    .build();
  log::info!("{} {}", log, msg);
}

pub fn log_error(ctx: &LogContext, msg: &str, error: Option<&str>) {
  let mut builder = LogBuilder::new("ERROR", &ctx.service, &ctx.operation)
    .request_id(&ctx.request_id)
    .user_id(ctx.user_id.as_deref().unwrap_or(""));
  if let Some(e) = error {
    builder = builder.error(e);
  }
  let log = builder.build();
  log::error!("{} {}", log, msg);
}

pub fn log_debug(ctx: &LogContext, msg: &str) {
  let log = LogBuilder::new("DEBUG", &ctx.service, &ctx.operation)
    .request_id(&ctx.request_id)
    .user_id(ctx.user_id.as_deref().unwrap_or(""))
    .build();
  log::debug!("{} {}", log, msg);
}

pub fn log_warn(ctx: &LogContext, msg: &str) {
  let log = LogBuilder::new("WARN", &ctx.service, &ctx.operation)
    .request_id(&ctx.request_id)
    .user_id(ctx.user_id.as_deref().unwrap_or(""))
    .build();
  log::warn!("{} {}", log, msg);
}

pub fn sanitize_data(data: &mut Value) {
  if let Some(obj) = data.as_object_mut() {
    let sensitive_fields = [
      "password",
      "token",
      "secret",
      "api_key",
      "apikey",
      "authorization",
      "refresh_token",
      "access_token",
      "totp_secret",
      "recovery_codes",
    ];
    for field in sensitive_fields {
      if let Some(v) = obj.get(field) {
        if let Some(s) = v.as_str() {
          if s.len() > 4 {
            let partial: String = s
              .chars()
              .take(2)
              .chain("...".chars())
              .chain(s.chars().rev().take(2))
              .collect();
            obj.insert(field.to_string(), Value::String(partial));
          } else {
            obj.insert(field.to_string(), Value::String("***".to_string()));
          }
        } else {
          obj.insert(field.to_string(), Value::String("***".to_string()));
        }
      }
    }
    for (_, v) in obj.iter_mut() {
      sanitize_data(v);
    }
  } else if let Some(arr) = data.as_array_mut() {
    for item in arr.iter_mut() {
      sanitize_data(item);
    }
  }
}

pub fn sanitize_email(email: &str) -> String {
  if let Some(at_pos) = email.find('@') {
    let local = &email[..at_pos];
    let domain = &email[at_pos..];
    if local.len() > 2 {
      let partial: String = local.chars().take(2).chain("***".chars()).collect();
      return format!("{}{}", partial, domain);
    }
  }
  "***@***".to_string()
}

pub struct OperationTimer {
  start: Instant,
  ctx: LogContext,
}

impl OperationTimer {
  pub fn new(service: &str, operation: &str) -> Self {
    Self {
      start: Instant::now(),
      ctx: LogContext::new(service, operation),
    }
  }

  pub fn with_user_id(mut self, user_id: &str) -> Self {
    self.ctx.user_id = Some(user_id.to_string());
    self
  }

  pub fn set_user_id(&mut self, user_id: &str) {
    self.ctx.user_id = Some(user_id.to_string());
  }

  pub fn ctx(&self) -> &LogContext {
    &self.ctx
  }

  pub fn log_info(&self, msg: &str) {
    let duration = self.start.elapsed().as_millis() as u64;
    let log = LogBuilder::new("INFO", &self.ctx.service, &self.ctx.operation)
      .request_id(&self.ctx.request_id)
      .user_id(self.ctx.user_id.as_deref().unwrap_or(""))
      .duration_ms(duration)
      .build();
    log::info!("{} {}", log, msg);
  }

  pub fn log_error(&self, msg: &str, error: Option<&str>) {
    let duration = self.start.elapsed().as_millis() as u64;
    let mut builder = LogBuilder::new("ERROR", &self.ctx.service, &self.ctx.operation)
      .request_id(&self.ctx.request_id)
      .user_id(self.ctx.user_id.as_deref().unwrap_or(""))
      .duration_ms(duration);
    if let Some(e) = error {
      builder = builder.error(e);
    }
    let log = builder.build();
    log::error!("{} {}", log, msg);
  }

  pub fn log_warn(&self, msg: &str) {
    let duration = self.start.elapsed().as_millis() as u64;
    let log = LogBuilder::new("WARN", &self.ctx.service, &self.ctx.operation)
      .request_id(&self.ctx.request_id)
      .user_id(self.ctx.user_id.as_deref().unwrap_or(""))
      .duration_ms(duration)
      .build();
    log::warn!("{} {}", log, msg);
  }

  pub fn log_debug(&self, msg: &str) {
    let duration = self.start.elapsed().as_millis() as u64;
    let log = LogBuilder::new("DEBUG", &self.ctx.service, &self.ctx.operation)
      .request_id(&self.ctx.request_id)
      .user_id(self.ctx.user_id.as_deref().unwrap_or(""))
      .duration_ms(duration)
      .build();
    log::debug!("{} {}", log, msg);
  }
}
