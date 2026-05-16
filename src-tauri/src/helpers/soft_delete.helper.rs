use crate::helpers::timestamp_helper::timestamp_now_rfc3339;
use serde_json::{json, Value};

pub fn create_soft_delete_payload() -> Value {
  json!({
    "deleted_at": timestamp_now_rfc3339()
  })
}

pub fn create_restore_payload() -> Value {
  json!({
    "deleted_at": null,
    "restored_at": timestamp_now_rfc3339()
  })
}
