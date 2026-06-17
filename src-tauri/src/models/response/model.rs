use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
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
pub struct Response<T = Value> {
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

  pub fn error(status: Status, message: impl Into<String>) -> Self
  where
    T: Default,
  {
    Self {
      status,
      message: message.into(),
      data: T::default(),
    }
  }
}

impl<T: Serialize> Response<T> {
  pub fn to_json_value(self) -> Value {
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

pub type ResponseModel = Response<Value>;
pub type ResponseStatus = Status;

impl ResponseModel {
  pub fn new_false(message: &str) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: message.to_string(),
      data: Value::String("".to_string()),
    }
  }

  pub fn new_success(message: &str) -> Self {
    ResponseModel {
      status: ResponseStatus::Success,
      message: message.to_string(),
      data: Value::String("".to_string()),
    }
  }

  pub fn success_with_message(data: Value, message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::Success,
      message: message.into(),
      data,
    }
  }

  pub fn created(data: Value) -> Self {
    ResponseModel {
      status: ResponseStatus::Created,
      message: "Created successfully".into(),
      data,
    }
  }

  pub fn updated(data: Value) -> Self {
    ResponseModel {
      status: ResponseStatus::Updated,
      message: "Updated successfully".into(),
      data,
    }
  }

  pub fn deleted(data: Value) -> Self {
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
      data: Value::Null,
    }
  }

  pub fn not_found(entity: &str) -> Self {
    ResponseModel {
      status: ResponseStatus::NotFound,
      message: format!("{} not found", entity),
      data: Value::Null,
    }
  }

  pub fn unauthorized(message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::Unauthorized,
      message: message.into(),
      data: Value::Null,
    }
  }

  pub fn forbidden(message: impl Into<String>) -> Self {
    ResponseModel {
      status: ResponseStatus::Forbidden,
      message: message.into(),
      data: Value::Null,
    }
  }
}

impl From<Box<dyn std::error::Error + Send + Sync>> for ResponseModel {
  fn from(error: Box<dyn std::error::Error + Send + Sync>) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error.to_string(),
      data: Value::String("".to_string()),
    }
  }
}

impl From<serde_json::Error> for ResponseModel {
  fn from(error: serde_json::Error) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error.to_string(),
      data: Value::String("".to_string()),
    }
  }
}

impl From<String> for ResponseModel {
  fn from(error: String) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error,
      data: Value::String("".to_string()),
    }
  }
}

impl From<nosql_orm::error::OrmError> for ResponseModel {
  fn from(error: nosql_orm::error::OrmError) -> Self {
    err_response_formatted("Database error", &error.to_string())
  }
}

pub fn err_response(message: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: message.to_string(),
    data: Value::String("".to_string()),
  }
}

pub fn err_response_formatted(prefix: &str, error: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: format!("{}: {}", prefix, error),
    data: Value::String("".to_string()),
  }
}

pub fn success_response<T: Serialize>(data: T) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Success,
    message: "Operation successful".to_string(),
    data: serde_json::to_value(data).unwrap_or(Value::Null),
  }
}
