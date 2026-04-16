use crate::entities::relation_obj::RelationObj;
use crate::entities::sync_metadata_entity::SyncMetadata;
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
  pub load: Option<Vec<String>>, // NEW: TypeORM-like dot notation for relations
}

#[derive(Debug, Serialize)]
pub struct WsResponse {
  pub requestId: Option<String>,
  #[serde(flatten)]
  pub response: crate::entities::response_entity::ResponseModel,
}

#[derive(Debug, Serialize)]
pub struct WsBroadcast {
  pub event: String,
  pub entity: String,
  pub data: Value,
}
