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

impl PendingRequestEntity {
  pub fn new(
    operation: String,
    table: String,
    record_id: Option<String>,
    data: Option<serde_json::Value>,
    filter: Option<serde_json::Value>,
    sync_metadata: Option<serde_json::Value>,
  ) -> Self {
    let now = chrono::Utc::now();
    Self {
      id: None,
      operation,
      table,
      record_id,
      data,
      filter,
      sync_metadata,
      status: "pending".to_string(),
      retry_count: 0,
      error_message: None,
      created_at: Some(now),
      updated_at: Some(now),
    }
  }

  pub fn is_write_operation(&self) -> bool {
    matches!(
      self.operation.as_str(),
      "create"
        | "update"
        | "delete"
        | "permanent-delete"
        | "soft-delete-cascade"
        | "restore-cascade"
        | "restore"
        | "updateAll"
    )
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessQueueResult {
  pub processed: usize,
  pub succeeded: usize,
  pub failed: usize,
  pub errors: Vec<QueueError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueError {
  pub queue_id: String,
  pub operation: String,
  pub error: String,
}
