use crate::models::response::{ResponseModel, ResponseStatus};
/// Creates an error response with the given message
pub fn err_response(message: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: message.to_string(),
    data: serde_json::Value::String("".to_string()),
  }
}
/// Creates an error response with a formatted message
pub fn err_response_formatted(prefix: &str, error: &str) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: format!("{}: {}", prefix, error),
    data: serde_json::Value::String("".to_string()),
  }
}
/// Creates a success response with data
pub fn success_response<T: serde::Serialize>(data: T) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Success,
    message: "Operation successful".to_string(),
    data: serde_json::to_value(data).unwrap_or(serde_json::Value::Null),
  }
}
