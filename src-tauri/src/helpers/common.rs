/* sys lib */
use chrono::Local;
use serde::Serialize;

/* models */
use crate::models::response::DataValue;

pub fn get_current_date() -> String {
  let current_datetime = Local::now();
  format!("{}", current_datetime.format("%Y_%m_%d_%H_%M_%S"))
}

pub fn convert_data_to_array<T: Serialize>(data: &Vec<T>) -> DataValue {
  let serialized_array: Vec<serde_json::Value> = data
    .into_iter()
    .map(|item| serde_json::to_value(item).unwrap())
    .collect();

  DataValue::Array(serialized_array)
}

pub fn convert_data_to_object<T: Serialize>(data: &T) -> DataValue {
  let serialized_object: serde_json::Value = serde_json::to_value(data).unwrap();

  DataValue::Object(serialized_object)
}
