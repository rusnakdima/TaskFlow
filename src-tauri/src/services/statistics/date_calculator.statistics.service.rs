use chrono::{DateTime, Datelike, Duration, Local, Utc};
use serde_json::Value;

pub struct DateCalculator;

impl DateCalculator {
  pub fn calculateDateRange(timeRange: &str) -> (DateTime<Local>, DateTime<Local>) {
    let now = Utc::now().with_timezone(&Local);

    let startDate = match timeRange {
      "day" => now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(Local)
        .unwrap(),
      "week" => {
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
      "month" => now
        .date_naive()
        .with_day(1)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(Local)
        .unwrap(),
      "quarter" => {
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
        let start_of_year = now.date_naive().with_ordinal(1).unwrap();
        start_of_year
          .and_hms_opt(0, 0, 0)
          .unwrap()
          .and_local_timezone(Local)
          .unwrap()
      }
      _ => now - Duration::days(7),
    };

    let endDate = now;

    (startDate, endDate)
  }
}
