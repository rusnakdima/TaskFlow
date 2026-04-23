use crate::entities::statistics_entity::{
  CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem,
};
use chrono::{DateTime, Datelike, NaiveDate, Weekday};
use serde_json::Value;
use std::collections::HashMap;

pub struct chart_generator;

impl chart_generator {
  pub fn compute_chart_data(
    tasks: &[Value],
    categories: &[Value],
    daily_activities: &[Value],
    _start_date: &NaiveDate,
    _end_date: &NaiveDate,
  ) -> ChartDataModel {
    let mut completion_by_weekday: HashMap<Weekday, (i32, i32)> = HashMap::new();

    for task in tasks {
      if let Some(updated_at) = task.get("updated_at").and_then(|v| v.as_str()) {
        if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
          if let Ok(dt_updated) = DateTime::parse_from_rfc3339(updated_at) {
            let weekday = dt_updated.weekday();
            let entry = completion_by_weekday.entry(weekday).or_insert((0, 0));
            entry.1 += 1;
            if status == "completed" || status == "skipped" {
              entry.0 += 1;
            }
          }
        }
      }
    }

    let mut completion_trend = Vec::new();
    let weekdays = [
      Weekday::Mon,
      Weekday::Tue,
      Weekday::Wed,
      Weekday::Thu,
      Weekday::Fri,
      Weekday::Sat,
      Weekday::Sun,
    ];

    for &weekday in &weekdays {
      let day_name = match weekday {
        Weekday::Mon => "Monday",
        Weekday::Tue => "Tuesday",
        Weekday::Wed => "Wednesday",
        Weekday::Thu => "Thursday",
        Weekday::Fri => "Friday",
        Weekday::Sat => "Saturday",
        Weekday::Sun => "Sunday",
      }
      .to_string();

      let (completed, total) = completion_by_weekday
        .get(&weekday)
        .copied()
        .unwrap_or((0, 0));
      let percentage = if total > 0 {
        (completed as f32 / total as f32 * 100.0) as i32
      } else {
        0
      };

      completion_trend.push(CompletionTrendItem {
        label: day_name,
        value: percentage,
      });
    }

    let mut daily_activity_map: HashMap<String, i32> = HashMap::new();

    let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for day in &day_names {
      daily_activity_map.insert(day.to_string(), 0);
    }

    for activity in daily_activities {
      if let Some(date_str) = activity.get("date").and_then(|v| v.as_str()) {
        if let Some(total_activity) = activity.get("total_activity").and_then(|v| v.as_i64()) {
          if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            let weekday = date.weekday();
            let day_index = match weekday {
              Weekday::Mon => 0,
              Weekday::Tue => 1,
              Weekday::Wed => 2,
              Weekday::Thu => 3,
              Weekday::Fri => 4,
              Weekday::Sat => 5,
              Weekday::Sun => 6,
            };
            let day_name = day_names[day_index];
            if let Some(count) = daily_activity_map.get_mut(day_name) {
              *count += total_activity as i32;
            }
          }
        }
      }
    }

    let daily_activity: Vec<DailyActivityItem> = day_names
      .iter()
      .map(|day| DailyActivityItem {
        day_name: day.to_string(),
        activity: *daily_activity_map.get(*day).unwrap_or(&0),
      })
      .collect();

    let category_colors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];
    let mut category_items = Vec::new();

    for (index, category) in categories.iter().enumerate() {
      if let Some(category_title) = category.get("title").and_then(|v| v.as_str()) {
        let total_tasks = category
          .get("task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

        let completed_tasks = category
          .get("completed_task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

        let percentage = if total_tasks > 0 {
          ((completed_tasks as f32 / total_tasks as f32) * 100.0) as i32
        } else {
          0
        };

        category_items.push(CategoryItem {
          name: category_title.to_string(),
          count: total_tasks,
          percentage,
          color: category_colors[index % category_colors.len()].to_string(),
        });
      }
    }

    ChartDataModel {
      completion_trend,
      categories: category_items,
      daily_activity,
    }
  }
}
