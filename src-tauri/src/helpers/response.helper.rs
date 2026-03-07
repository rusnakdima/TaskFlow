use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

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
