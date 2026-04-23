use chrono::Utc;

/// Get current UTC timestamp in RFC3339 format
pub fn get_current_timestamp() -> String {
  Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}
