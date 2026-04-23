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

#[allow(dead_code)]
pub fn normalize_camel_case_keys(value: Value) -> Value {
  match value {
    Value::Object(map) => {
      let mut new_map = serde_json::Map::new();
      for (key, val) in map {
        let snake_key = camel_to_snake(&key);
        let normalized_val = normalize_camel_case_keys(val);
        new_map.insert(snake_key, normalized_val);
      }
      Value::Object(new_map)
    }
    Value::Array(arr) => Value::Array(arr.into_iter().map(normalize_camel_case_keys).collect()),
    _ => value,
  }
}

#[allow(dead_code)]
fn camel_to_snake(s: &str) -> String {
  let mut result = String::new();
  for (i, c) in s.chars().enumerate() {
    if c.is_uppercase() && i > 0 {
      result.push('_');
    }
    result.push(c.to_lowercase().next().unwrap_or(c));
  }
  result
}

pub fn get_provider_type(sync_metadata: &SyncMetadata) -> Result<ProviderType, ResponseModel> {
  tracing::debug!(
    "[get_provider_type] sync_metadata: is_owner={}, is_private={}",
    sync_metadata.is_owner,
    sync_metadata.is_private
  );
  match (sync_metadata.is_owner, sync_metadata.is_private) {
    (true, true) => {
      tracing::debug!("[get_provider_type] -> Json (owner + private)");
      Ok(ProviderType::Json)
    }
    (false, false) => {
      tracing::debug!("[get_provider_type] -> Mongo (not owner + shared)");
      Ok(ProviderType::Mongo)
    }
    (true, false) => {
      tracing::debug!("[get_provider_type] -> Mongo (owner + shared)");
      Ok(ProviderType::Mongo)
    }
    (false, true) => {
      tracing::warn!(
        "[get_provider_type] -> Error (cannot have is_owner false and is_private true)"
      );
      Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Incorrect request: cannot have is_owner false and is_private true".to_string(),
        data: DataValue::String("".to_string()),
      })
    }
  }
}
