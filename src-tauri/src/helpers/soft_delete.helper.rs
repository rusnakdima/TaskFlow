use nosql_orm::timestamps::timestamp_now_rfc3339;
use serde_json::json;

pub fn soft_delete_patch() -> serde_json::Value {
  json!({ "deleted_at": timestamp_now_rfc3339() })
}

pub fn restore_patch() -> serde_json::Value {
  json!({ "deleted_at": serde_json::Value::Null })
}
