use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum AppError {
  NotFound(String),
  ValidationError(String),
  Duplicate(String),
  Unauthorized,
  Forbidden,
  Internal(String),
  Database(String),
  Network(String),
  Io(String),
  PermissionDenied(String),
  InvalidPath(String),
}

impl fmt::Display for AppError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::NotFound(msg) => write!(f, "Not found: {}", msg),
      Self::ValidationError(msg) => write!(f, "Validation error: {}", msg),
      Self::Duplicate(msg) => write!(f, "Duplicate: {}", msg),
      Self::Unauthorized => write!(f, "Unauthorized"),
      Self::Forbidden => write!(f, "Forbidden"),
      Self::Internal(msg) => write!(f, "Internal error: {}", msg),
      Self::Database(msg) => write!(f, "Database error: {}", msg),
      Self::Network(msg) => write!(f, "Network error: {}", msg),
      Self::Io(msg) => write!(f, "IO error: {}", msg),
      Self::PermissionDenied(msg) => write!(f, "Permission denied: {}", msg),
      Self::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
    }
  }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
  fn from(err: std::io::Error) -> Self {
    match err.kind() {
      std::io::ErrorKind::NotFound => Self::NotFound(err.to_string()),
      std::io::ErrorKind::PermissionDenied => Self::PermissionDenied(err.to_string()),
      _ => Self::Io(err.to_string()),
    }
  }
}

impl From<serde_json::Error> for AppError {
  fn from(err: serde_json::Error) -> Self {
    Self::ValidationError(err.to_string())
  }
}

impl From<nosql_orm::prelude::OrmError> for AppError {
  fn from(err: nosql_orm::prelude::OrmError) -> Self {
    match err {
      nosql_orm::prelude::OrmError::NotFound(_) => Self::NotFound("Entity".into()),
      nosql_orm::prelude::OrmError::Duplicate(_) => Self::Duplicate("Entity".into()),
      _ => Self::Database(err.to_string()),
    }
  }
}
