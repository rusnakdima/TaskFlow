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

#[allow(dead_code)]
pub fn add_timestamps(data: &mut serde_json::Value) {
  let now = chrono::Utc::now().to_rfc3339();
  data["created_at"] = serde_json::json!(now);
  data["updated_at"] = serde_json::json!(now);
}

#[allow(dead_code)]
pub trait JsonExt {
  fn get_str(&self, key: &str) -> Option<&str>;
  fn get_string(&self, key: &str) -> Option<String>;
  fn get_i64(&self, key: &str) -> Option<i64>;
  fn get_bool(&self, key: &str) -> Option<bool>;
}

impl JsonExt for serde_json::Value {
  fn get_str(&self, key: &str) -> Option<&str> {
    self.get(key).and_then(|v| v.as_str())
  }

  fn get_string(&self, key: &str) -> Option<String> {
    self.get(key).and_then(|v| v.as_str()).map(String::from)
  }

  fn get_i64(&self, key: &str) -> Option<i64> {
    self.get(key).and_then(|v| v.as_i64())
  }

  fn get_bool(&self, key: &str) -> Option<bool> {
    self.get(key).and_then(|v| v.as_bool())
  }
}
