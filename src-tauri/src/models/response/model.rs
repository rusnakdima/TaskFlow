pub use tauri_shared::response::Response;
pub use tauri_shared::response::Status;

use serde::Serialize;
use serde_json::Value;

pub type ResponseModel = Response<Value>;
pub type ResponseStatus = Status;

// Helper constructors (free functions instead of impl methods since Response is external)
pub fn new_false(message: &str) -> ResponseModel {
  Response::error_with_data(Value::String(String::new()), message)
}
pub fn new_success(message: &str) -> ResponseModel {
  Response::success(Value::String(String::new()), Some(message))
}
pub fn success_with_message(data: Value, message: impl Into<String>) -> ResponseModel {
  Response::success(data, Some(&*message.into()))
}
pub fn created(data: Value) -> ResponseModel {
  Response::created(data)
}
pub fn updated(data: Value) -> ResponseModel {
  Response::updated(data)
}
pub fn deleted(data: Value) -> ResponseModel {
  Response::deleted(data)
}
pub fn validation_error(message: impl Into<String>) -> ResponseModel {
  Response::validation_error(message)
}
pub fn not_found(entity: &str) -> ResponseModel {
  Response::not_found(entity)
}
pub fn unauthorized(message: impl Into<String>) -> ResponseModel {
  Response::unauthorized(message)
}
pub fn forbidden(message: impl Into<String>) -> ResponseModel {
  Response::forbidden(message)
}

// Note: From impls removed — use err_response() / err_response_formatted() instead
pub fn err_response(message: &str) -> ResponseModel {
  Response::error(message)
}
pub fn err_response_formatted(prefix: &str, error: &str) -> ResponseModel {
  Response::error(format!("{}: {}", prefix, error))
}
pub fn success_response<T: Serialize>(data: T) -> ResponseModel {
  Response::success(
    serde_json::to_value(data).unwrap_or(Value::Null),
    Some("Operation successful"),
  )
}
