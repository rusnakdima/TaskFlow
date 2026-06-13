use chrono::{DateTime, Datelike, Duration, Local, Utc};

pub struct DateCalculator;

impl DateCalculator {
  pub fn calculate_date_range(time_range: &str) -> (DateTime<Local>, DateTime<Local>) {
    let now = Utc::now().with_timezone(&Local);

    let start_date = match time_range {
      "day" => now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|dt| dt.and_local_timezone(Local).single())
        .unwrap_or(now),
      "week" => {
        let weekday = now.weekday();
        let days_since_monday = weekday.num_days_from_monday() as i64;
        let start_of_week = now - Duration::days(days_since_monday);
        start_of_week
          .date_naive()
          .and_hms_opt(0, 0, 0)
          .and_then(|dt| dt.and_local_timezone(Local).single())
          .unwrap_or(start_of_week)
      }
      "month" => {
        let naive = now.date_naive().with_day(1).unwrap_or(now.date_naive());
        naive
          .and_hms_opt(0, 0, 0)
          .and_then(|dt| dt.and_local_timezone(Local).single())
          .unwrap_or(now)
      }
      "quarter" => {
        let month = now.month();
        let quarter_start_month = match month {
          1..=3 => 1,
          4..=6 => 4,
          7..=9 => 7,
          _ => 10,
        };
        let naive = now
          .date_naive()
          .with_month(quarter_start_month)
          .unwrap_or(now.date_naive())
          .with_day(1)
          .unwrap_or(now.date_naive());
        naive
          .and_hms_opt(0, 0, 0)
          .and_then(|dt| dt.and_local_timezone(Local).single())
          .unwrap_or(now)
      }
      "year" => {
        let naive = now.date_naive().with_ordinal(1).unwrap_or(now.date_naive());
        naive
          .and_hms_opt(0, 0, 0)
          .and_then(|dt| dt.and_local_timezone(Local).single())
          .unwrap_or(now)
      }
      _ => now - Duration::days(7),
    };

    let end_date = now;

    (start_date, end_date)
  }
}
