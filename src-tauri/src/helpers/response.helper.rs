use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/// Creates an error response with the given message
pub fn err_response(message: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: message.to_string(),
    data: DataValue::String("".to_string()),
  }
}

/// Creates an error response with a formatted message
pub fn err_response_formatted(prefix: &str, error: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: format!("{}: {}", prefix, error),
    data: DataValue::String("".to_string()),
  }
}

/// Creates a success response with data
pub fn success_response<T: Into<DataValue>>(data: T) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Success,
    message: "Operation successful".to_string(),
    data: data.into(),
  }
}

/// Logs a message (non-error, for debugging/sync operations)
pub fn log_response(message: &str) {
  println!("[ProfileSync] {}", message);
}
