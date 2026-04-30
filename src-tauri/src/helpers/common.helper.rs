/* sys lib */
use serde::Serialize;

/* models */
use crate::entities::response_entity::DataValue;

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
