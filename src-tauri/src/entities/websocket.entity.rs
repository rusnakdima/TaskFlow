use crate::entities::relation_obj::RelationObj;
use crate::entities::sync_metadata_entity::SyncMetadata;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct WsRequest {
  pub action: String,
  pub entity: String,
  pub filter: Option<Value>,
  pub data: Option<Value>,
  pub id: Option<String>,
  pub request_id: Option<String>,
  pub sync_metadata: Option<SyncMetadata>,
  pub relations: Option<Vec<RelationObj>>,
  pub load: Option<Vec<String>>,
  #[serde(default)]
  pub is_permanent: Option<bool>,
  #[serde(default)]
  pub is_cascade: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct WsResponse {
  pub request_id: Option<String>,
  #[serde(flatten)]
  pub response: crate::entities::response_entity::ResponseModel,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct WsBroadcast {
  pub event: String,
  pub entity: String,
  pub data: Value,
}
