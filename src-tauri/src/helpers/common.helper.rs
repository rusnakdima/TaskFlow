/* sys lib */
use serde::Serialize;
use serde_json::Value;

/* models */
use crate::entities::{
  provider_type_entity::ProviderType,
  response_entity::DataValue,
  response_entity::{ResponseModel, ResponseStatus},
  sync_metadata_entity::SyncMetadata,
};

pub fn convert_data_to_array<T: Serialize>(data: &[T]) -> DataValue {
  let serialized_array: Vec<serde_json::Value> = data
    .iter()
    .map(|item| serde_json::to_value(item).unwrap())
    .collect();

  DataValue::Array(serialized_array)
}

pub fn convert_data_to_object<T: Serialize>(data: &T) -> DataValue {
  let serialized_object: serde_json::Value = serde_json::to_value(data).unwrap();

  DataValue::Object(serialized_object)
}
