/* sys lib */
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("pending_requests")]
pub struct PendingRequestEntity {
  pub id: Option<String>,
  pub operation: String,
  pub table: String,
  pub record_id: Option<String>,
  pub data: Option<serde_json::Value>,
  pub filter: Option<serde_json::Value>,
  pub sync_metadata: Option<serde_json::Value>,
  pub status: String,
  pub retry_count: i32,
  pub error_message: Option<String>,
  pub created_at: Option<chrono::DateTime<chrono::Utc>>,
  pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl PendingRequestEntity {}
