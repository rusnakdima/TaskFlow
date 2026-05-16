use chrono::{DateTime, Utc};

/// Get current UTC datetime for entity timestamps
pub fn get_current_datetime() -> DateTime<Utc> {
  Utc::now()
}
