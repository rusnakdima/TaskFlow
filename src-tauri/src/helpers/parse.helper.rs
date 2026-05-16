use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

pub fn map_err_parse<T>(err: serde_json::Error) -> ResponseModel {
  ResponseModel {
    status: ResponseStatus::Error,
    message: format!("Parse error: {}", err),
    data: DataValue::String("".to_string()),
  }
}

pub fn extract_error_message(err: &dyn std::error::Error) -> String {
  err.to_string()
}
