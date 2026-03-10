use chrono::{DateTime, Duration, Local, Utc};
use serde_json::Value;

pub struct DateCalculator;

impl DateCalculator {
  pub fn calculateDateRange(timeRange: &str) -> (DateTime<Local>, DateTime<Local>) {
    let now = Utc::now().with_timezone(&Local);
    let endDate = now;

    let startDate = match timeRange {
      "day" => now - Duration::days(1),
      "week" => now - Duration::days(7),
      "month" => now - Duration::days(30),
      "quarter" => now - Duration::days(90),
      "year" => now - Duration::days(365),
      _ => now - Duration::days(7),
    };

    (startDate, endDate)
  }

  pub fn filterByDateRange(
    items: &Vec<Value>,
    startDate: &DateTime<Local>,
    endDate: &DateTime<Local>,
    dateField: &str,
  ) -> Vec<Value> {
    items
      .iter()
      .filter(|item| {
        if let Some(dateStr) = item.get(dateField).and_then(|v| v.as_str()) {
          if let Ok(dt) = DateTime::parse_from_rfc3339(dateStr) {
            let dtLocal = dt.with_timezone(&Local);
            return dtLocal >= *startDate && dtLocal <= *endDate;
          }
        }
        false
      })
      .cloned()
      .collect()
  }
}
