use chrono::{DateTime, Datelike, Duration, Local, Utc};
use serde_json::Value;

pub struct DateCalculator;

impl DateCalculator {
  pub fn calculateDateRange(timeRange: &str) -> (DateTime<Local>, DateTime<Local>) {
    let now = Utc::now().with_timezone(&Local);

    // FIX: Calculate proper date ranges based on user expectations
    let startDate = match timeRange {
      "day" => {
        // Today: start of current day
        now
          .date_naive()
          .and_hms_opt(0, 0, 0)
          .unwrap()
          .and_local_timezone(Local)
          .unwrap()
      }
      "week" => {
        // Current week (Monday to today)
        let weekday = now.weekday();
        let days_since_monday = weekday.num_days_from_monday() as i64;
        let start_of_week = now - Duration::days(days_since_monday);
        start_of_week
          .date_naive()
          .and_hms_opt(0, 0, 0)
          .unwrap()
          .and_local_timezone(Local)
          .unwrap()
      }
      "month" => {
        // Current month (1st to today)
        now
          .date_naive()
          .with_day(1)
          .unwrap()
          .and_hms_opt(0, 0, 0)
          .unwrap()
          .and_local_timezone(Local)
          .unwrap()
      }
      "quarter" => {
        // Current quarter (start of quarter to today)
        let month = now.month();
        let quarter_start_month = match month {
          1..=3 => 1,
          4..=6 => 4,
          7..=9 => 7,
          _ => 10,
        };
        now
          .date_naive()
          .with_month(quarter_start_month)
          .unwrap()
          .with_day(1)
          .unwrap()
          .and_hms_opt(0, 0, 0)
          .unwrap()
          .and_local_timezone(Local)
          .unwrap()
      }
      "year" => {
        // Current year (Jan 1 to today)
        let start_of_year = now.date_naive().with_ordinal(1).unwrap();
        start_of_year
          .and_hms_opt(0, 0, 0)
          .unwrap()
          .and_local_timezone(Local)
          .unwrap()
      }
      _ => {
        // Default: last 7 days (for backward compatibility)
        now - Duration::days(7)
      }
    };

    // End date is always now
    let endDate = now;

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
