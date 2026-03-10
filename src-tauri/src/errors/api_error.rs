use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
  #[error("Database error: {0}")]
  Database(String),

  #[error("Record not found: {0}")]
  NotFound(String),

  #[error("Validation error: {0}")]
  Validation(String),

  #[error("Authentication error: {0}")]
  Auth(String),

  #[error("Internal error: {0}")]
  Internal(String),

  #[error("Serialization error: {0}")]
  Serialization(String),
}

#[allow(dead_code)]
pub type ApiResult<T> = Result<T, ApiError>;

impl From<ApiError> for ResponseModel {
  fn from(error: ApiError) -> Self {
    ResponseModel {
      status: ResponseStatus::Error,
      message: error.to_string(),
      data: DataValue::String("".to_string()),
    }
  }
}

// Convert common errors to ApiError
impl From<mongodb::error::Error> for ApiError {
  fn from(err: mongodb::error::Error) -> Self {
    ApiError::Database(err.to_string())
  }
}

impl From<serde_json::Error> for ApiError {
  fn from(err: serde_json::Error) -> Self {
    ApiError::Serialization(err.to_string())
  }
}

impl From<mongodb::bson::ser::Error> for ApiError {
  fn from(err: mongodb::bson::ser::Error) -> Self {
    ApiError::Serialization(err.to_string())
  }
}

impl From<mongodb::bson::de::Error> for ApiError {
  fn from(err: mongodb::bson::de::Error) -> Self {
    ApiError::Serialization(err.to_string())
  }
}

impl From<String> for ApiError {
  fn from(err: String) -> Self {
    ApiError::Internal(err)
  }
}

impl From<&str> for ApiError {
  fn from(err: &str) -> Self {
    ApiError::Internal(err.to_string())
  }
}
