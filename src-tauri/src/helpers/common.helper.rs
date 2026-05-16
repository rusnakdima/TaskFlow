/* sys lib */
use serde::Serialize;

/* models */
use crate::entities::response_entity::DataValue;

pub fn filter_deleted(records: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
  records
    .into_iter()
    .filter(|r| r.get("deleted_at").map(|v| v.is_null()).unwrap_or(true))
    .collect()
}

pub fn format_date(value: &str) -> Option<String> {
  if value.is_empty() {
    return None;
  }
  if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
    return Some(
      dt.with_timezone(&chrono::Utc)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string(),
    );
  }
  None
}

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
