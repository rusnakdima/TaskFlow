use crate::models::sync_metadata_model::SyncMetadata;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Serialize)]
#[allow(non_snake_case)]
pub struct WsRequest {
  pub action: String,
  pub entity: String,
  pub filter: Option<Value>,
  pub data: Option<Value>,
  pub id: Option<String>,
  pub requestId: Option<String>,
  pub syncMetadata: Option<SyncMetadata>,
}

#[derive(Debug, Serialize)]
#[allow(non_snake_case)]
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
