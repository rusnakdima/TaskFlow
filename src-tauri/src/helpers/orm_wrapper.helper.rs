use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};
use nosql_orm::error::OrmError;

pub fn orm_result_to_response<T: Into<DataValue>>(result: Result<T, OrmError>) -> ResponseModel {
  match result {
    Ok(data) => ResponseModel {
      status: ResponseStatus::Success,
      message: "Operation successful".to_string(),
      data: data.into(),
    },
    Err(e) => ResponseModel {
      status: ResponseStatus::Error,
      message: e.to_string(),
      data: DataValue::String("".to_string()),
    },
  }
}

pub fn orm_result_array_to_response(
  result: Result<Vec<serde_json::Value>, OrmError>,
) -> ResponseModel {
  match result {
    Ok(docs) => ResponseModel {
      status: ResponseStatus::Success,
      message: "Operation successful".to_string(),
      data: DataValue::Array(docs),
    },
    Err(e) => ResponseModel {
      status: ResponseStatus::Error,
      message: e.to_string(),
      data: DataValue::String("".to_string()),
    },
  }
}

pub fn orm_result_option_to_response(
  result: Result<Option<serde_json::Value>, OrmError>,
) -> ResponseModel {
  match result {
    Ok(Some(data)) => ResponseModel {
      status: ResponseStatus::Success,
      message: "Operation successful".to_string(),
      data: DataValue::Object(data),
    },
    Ok(None) => ResponseModel {
      status: ResponseStatus::Error,
      message: "Document not found".to_string(),
      data: DataValue::String("".to_string()),
    },
    Err(e) => ResponseModel {
      status: ResponseStatus::Error,
      message: e.to_string(),
      data: DataValue::String("".to_string()),
    },
  }
}
