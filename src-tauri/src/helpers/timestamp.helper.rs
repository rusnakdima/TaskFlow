use chrono::{DateTime, Utc};

/// Get current UTC datetime for entity timestamps
pub fn get_current_datetime() -> DateTime<Utc> {
  Utc::now()
}

/// Get current UTC datetime as RFC3339 string for JSON serialization
pub fn timestamp_now_rfc3339() -> String {
  Utc::now().to_rfc3339()
}
