/* sys lib */
use serde::Serialize;

pub const TABLES_WITHOUT_SOFT_DELETE: &[&str] = &["users", "profiles", "comments"];

pub fn supports_soft_delete(table: &str) -> bool {
  !TABLES_WITHOUT_SOFT_DELETE.contains(&table)
}

/* models */
use crate::models::{
  provider_type_model::ProviderType,
  response_model::DataValue,
  response_model::{ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
};

pub fn convertDataToArray<T: Serialize>(data: &[T]) -> DataValue {
  let serialized_array: Vec<serde_json::Value> = data
    .iter()
    .map(|item| serde_json::to_value(item).unwrap())
    .collect();

  DataValue::Array(serialized_array)
}

pub fn convertDataToObject<T: Serialize>(data: &T) -> DataValue {
  let serialized_object: serde_json::Value = serde_json::to_value(data).unwrap();

  DataValue::Object(serialized_object)
}

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
