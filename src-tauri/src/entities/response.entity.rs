/* sys lib */
use serde::{Deserialize, Serialize};

use crate::helpers::response_helper::err_response_formatted;
use nosql_orm::error::OrmError;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub enum ResponseStatus {
  #[serde(rename = "Success")]
  Success,
  #[serde(rename = "info")]
  Info,
  #[serde(rename = "Warning")]
  Warning,
  #[serde(rename = "Error")]
  Error,
  #[serde(rename = "Created")]
  Created,
  #[serde(rename = "Updated")]
  Updated,
  #[serde(rename = "Deleted")]
  Deleted,
  #[serde(rename = "ValidationError")]
  ValidationError,
  #[serde(rename = "NotFound")]
  NotFound,
  #[serde(rename = "Unauthorized")]
  Unauthorized,
  #[serde(rename = "Forbidden")]
  Forbidden,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseModel {
  pub status: ResponseStatus,
  pub message: String,
  pub data: serde_json::Value,
}

impl ResponseModel {
  pub fn new_false(message: &str) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: message.to_string(),
      data: serde_json::Value::String("".to_string()),
    }
  }

  pub fn new_success(message: &str) -> Self {
    ResponseModel {
      status: ResponseStatus::Success,
      message: message.to_string(),
      data: serde_json::Value::String("".to_string()),
    }
  }

  pub fn success(data: serde_json::Value) -> Self {
    ResponseModel {
      status: ResponseStatus::Success,
      message: String::new(),
      data,
    }
  }

  pub fn success_with_message(data: serde_json::Value, message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::Success,
      message: message.into(),
      data,
    }
  }

  pub fn created(data: serde_json::Value) -> Self {
    ResponseModel {
      status: ResponseStatus::Created,
      message: "Created successfully".into(),
      data,
    }
  }

  pub fn updated(data: serde_json::Value) -> Self {
    ResponseModel {
      status: ResponseStatus::Updated,
      message: "Updated successfully".into(),
      data,
    }
  }

  pub fn deleted(data: serde_json::Value) -> Self {
    ResponseModel {
      status: ResponseStatus::Deleted,
      message: "Deleted successfully".into(),
      data,
    }
  }

  pub fn validation_error(message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::ValidationError,
      message: message.into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn not_found(entity: &str) -> Self {
    ResponseModel {
      status: ResponseStatus::NotFound,
      message: format!("{} not found", entity),
      data: serde_json::Value::Null,
    }
  }

  pub fn unauthorized(message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::Unauthorized,
      message: message.into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn forbidden(message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::Forbidden,
      message: message.into(),
      data: serde_json::Value::Null,
    }
  }
}

impl From<Box<dyn std::error::Error + Send + Sync>> for ResponseModel {
  fn from(error: Box<dyn std::error::Error + Send + Sync>) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error.to_string(),
      data: serde_json::Value::String("".to_string()),
    }
  }
}

impl From<serde_json::Error> for ResponseModel {
  fn from(error: serde_json::Error) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error.to_string(),
      data: serde_json::Value::String("".to_string()),
    }
  }
}

impl From<String> for ResponseModel {
  fn from(error: String) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error,
      data: serde_json::Value::String("".to_string()),
    }
  }
}

impl From<OrmError> for ResponseModel {
  fn from(err: OrmError) -> Self {
    err_response_formatted("Database error", &err.to_string())
  }
}
