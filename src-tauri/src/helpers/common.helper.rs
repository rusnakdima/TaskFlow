/* sys lib */
use chrono::Local;
use serde::Serialize;

/* models */
use crate::models::{
  provider_type_model::ProviderType,
  response_model::DataValue,
  response_model::{ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
};

#[allow(non_snake_case)]
pub fn _getCurrentDate() -> String {
  let current_datetime = Local::now();
  format!("{}", current_datetime.format("%Y_%m_%d_%H_%M_%S"))
}

#[allow(non_snake_case)]
pub fn convertDataToArray<T: Serialize>(data: &Vec<T>) -> DataValue {
  let serialized_array: Vec<serde_json::Value> = data
    .into_iter()
    .map(|item| serde_json::to_value(item).unwrap())
    .collect();

  DataValue::Array(serialized_array)
}

#[allow(non_snake_case)]
pub fn convertDataToObject<T: Serialize>(data: &T) -> DataValue {
  let serialized_object: serde_json::Value = serde_json::to_value(data).unwrap();

  DataValue::Object(serialized_object)
}

#[allow(non_snake_case)]
pub fn _typeOf<T>(_: T) -> &'static str {
  std::any::type_name::<T>()
}

#[allow(non_snake_case)]
pub fn getProviderType(syncMetadata: &SyncMetadata) -> Result<ProviderType, ResponseModel> {
  match (syncMetadata.isOwner, syncMetadata.isPrivate) {
    (true, true) => Ok(ProviderType::Json),
    (false, false) => Ok(ProviderType::Mongo),
    (true, false) => Ok(ProviderType::Mongo),
    (false, true) => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Incorrect request: cannot have isOwner false and isPrivate true".to_string(),
      data: DataValue::String("".to_string()),
    }),
  }
}
