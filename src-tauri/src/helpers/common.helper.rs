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

pub fn convertDataToArray<T: Serialize>(data: &[T]) -> DataValue {
  let serializedArray: Vec<serde_json::Value> = data
    .iter()
    .map(|item| serde_json::to_value(item).unwrap())
    .collect();

  DataValue::Array(serializedArray)
}

pub fn convertDataToObject<T: Serialize>(data: &T) -> DataValue {
  let serialized_object: serde_json::Value = serde_json::to_value(data).unwrap();

  DataValue::Object(serialized_object)
}

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

pub fn getProviderType(syncMetadata: &SyncMetadata) -> Result<ProviderType, ResponseModel> {
  tracing::debug!(
    "[getProviderType] syncMetadata: isOwner={}, isPrivate={}",
    syncMetadata.isOwner,
    syncMetadata.isPrivate
  );
  match (syncMetadata.isOwner, syncMetadata.isPrivate) {
    (true, true) => {
      tracing::debug!("[getProviderType] -> Json (owner + private)");
      Ok(ProviderType::Json)
    }
    (false, false) => {
      tracing::debug!("[getProviderType] -> Mongo (not owner + shared)");
      Ok(ProviderType::Mongo)
    }
    (true, false) => {
      tracing::debug!("[getProviderType] -> Mongo (owner + shared)");
      Ok(ProviderType::Mongo)
    }
    (false, true) => {
      tracing::warn!("[getProviderType] -> Error (cannot have isOwner false and isPrivate true)");
      Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Incorrect request: cannot have isOwner false and isPrivate true".to_string(),
        data: DataValue::String("".to_string()),
      })
    }
  }
}
