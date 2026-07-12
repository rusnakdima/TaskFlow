use crate::models::response::{Response, ResponseModel};
/// Creates an error response with the given message
pub fn err_response(message: &str) -> ResponseModel {
  Response::error(message)
}
/// Creates an error response with a formatted message
pub fn err_response_formatted(prefix: &str, error: &str) -> ResponseModel {
  Response::error(format!("{}: {}", prefix, error))
}
/// Creates a success response with data
pub fn success_response<T: serde::Serialize>(data: T) -> ResponseModel {
  Response::success(
    serde_json::to_value(data).unwrap_or(serde_json::Value::Null),
    Some("Operation successful"),
  )
}
