use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
  Success,
  Info,
  Warning,
  Error,
  Created,
  Updated,
  Deleted,
  ValidationError,
  NotFound,
  Unauthorized,
  Forbidden,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response<T = serde_json::Value> {
  pub status: Status,
  pub message: String,
  pub data: T,
}

impl<T> Response<T> {
  pub fn success(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Success,
      message: message.into(),
      data,
    }
  }

  pub fn created(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Created,
      message: message.into(),
      data,
    }
  }

  pub fn updated(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Updated,
      message: message.into(),
      data,
    }
  }

  pub fn deleted(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Deleted,
      message: message.into(),
      data,
    }
  }

  pub fn info(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Info,
      message: message.into(),
      data,
    }
  }

  pub fn warning(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Warning,
      message: message.into(),
      data,
    }
  }
}

impl Response<serde_json::Value> {
  pub fn error(status: Status, message: impl Into<String>) -> Self {
    Self {
      status,
      message: message.into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn validation_error(message: impl Into<String>) -> Self {
    Self::error(Status::ValidationError, message)
  }

  pub fn not_found(entity: &str) -> Self {
    Self::error(Status::NotFound, format!("{} not found", entity))
  }

  pub fn unauthorized() -> Self {
    Self::error(Status::Unauthorized, "Unauthorized")
  }

  pub fn forbidden() -> Self {
    Self::error(Status::Forbidden, "Forbidden")
  }
}

impl<T: Serialize> Response<T> {
  pub fn to_json_value(self) -> serde_json::Value {
    serde_json::to_value(self).unwrap_or_else(|_| {
      serde_json::json!({
          "status": "error",
          "message": "Serialization failed",
          "data": null
      })
    })
  }
}

impl Default for Status {
  fn default() -> Self {
    Status::Success
  }
}
