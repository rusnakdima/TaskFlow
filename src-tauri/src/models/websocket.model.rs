use crate::models::relation_obj::RelationObj;
use crate::models::sync_metadata_model::SyncMetadata;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Serialize)]
pub struct WsRequest {
  pub action: String,
  pub entity: String,
  pub filter: Option<Value>,
  pub data: Option<Value>,
  pub id: Option<String>,
  pub requestId: Option<String>,
  pub syncMetadata: Option<SyncMetadata>,
  pub relations: Option<Vec<RelationObj>>,
}

#[derive(Debug, Serialize)]
pub struct WsResponse {
  pub requestId: Option<String>,
  #[serde(flatten)]
  pub response: crate::models::response_model::ResponseModel,
}

#[derive(Debug, Serialize)]
pub struct WsBroadcast {
  pub event: String,
  pub entity: String,
  pub data: Value,
}
