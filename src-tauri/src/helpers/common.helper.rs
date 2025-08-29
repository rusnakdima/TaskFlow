/* sys lib */
use chrono::Local;
use serde::Serialize;

/* models */
use crate::models::response_model::DataValue;

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
