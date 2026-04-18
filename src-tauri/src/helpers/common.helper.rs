/* sys lib */
use serde::Serialize;

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
