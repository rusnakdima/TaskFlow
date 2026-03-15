use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};
use std::sync::Arc;

/* providers */
use crate::providers::mongodb_provider::MongodbProvider;

/// Creates an error response with the given message
pub fn errResponse(message: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: message.to_string(),
    data: DataValue::String("".to_string()),
  }
}

/// Creates an error response with a formatted message
pub fn errResponseFormatted(prefix: &str, error: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: format!("{}: {}", prefix, error),
    data: DataValue::String("".to_string()),
  }
}

/// Creates a success response with data
pub fn successResponse<T: Into<DataValue>>(data: T) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Success,
    message: "Operation successful".to_string(),
    data: data.into(),
  }
}

/// Check if MongoDB provider is available, return error if not
/// This is a helper to avoid duplicating MongoDB availability checks
pub fn require_mongo(
  mongodbProvider: &Option<Arc<MongodbProvider>>,
) -> Result<&Arc<MongodbProvider>, ResponseModel> {
  mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
    status: ResponseStatus::Error,
    message: "MongoDB not available".to_string(),
    data: DataValue::String("".to_string()),
  })
}
