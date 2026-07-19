pub use crate::models::response::ResponseModel;
use tauri_shared::response::Response;

pub fn err_response(message: &str) -> ResponseModel {
  Response::error(message)
}

pub fn err_response_formatted(prefix: &str, error: &str) -> ResponseModel {
  Response::error(format!("{}: {}", prefix, error))
}

pub fn success_response<T: serde::Serialize>(data: T) -> ResponseModel {
  Response::success(
    serde_json::to_value(data).unwrap_or(serde_json::Value::Null),
    Some("Operation successful"),
  )
}
