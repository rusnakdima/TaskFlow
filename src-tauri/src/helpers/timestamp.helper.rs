use chrono::{DateTime, Utc};

/// Get current UTC timestamp in RFC3339 format (string)
pub fn get_current_timestamp() -> String {
  Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Get current UTC datetime for entity timestamps
pub fn get_current_datetime() -> DateTime<Utc> {
  Utc::now()
}

/// Get current UTC datetime as RFC3339 string for JSON serialization
pub fn timestamp_now_rfc3339() -> String {
  Utc::now().to_rfc3339()
}
