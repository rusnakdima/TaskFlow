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
