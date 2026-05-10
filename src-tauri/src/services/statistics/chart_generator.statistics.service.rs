use crate::entities::statistics_entity::{
  CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem,
};
use chrono::{Datelike, NaiveDate, Weekday};
use nosql_orm::aggregation::{AggregationPipeline, GroupStage};
use serde_json::Value;
use std::collections::HashMap;

pub struct ChartGenerator;

impl ChartGenerator {
  pub async fn compute_chart_data(
    tasks: &[Value],
    categories: &[Value],
    daily_activities: &[Value],
    _start_date: &NaiveDate,
    _end_date: &NaiveDate,
  ) -> ChartDataModel {
    let completion_trend = Self::compute_completion_trend(tasks).await;
    let daily_activity = Self::compute_daily_activity(daily_activities).await;
    let category_items = Self::compute_category_items(categories).await;

    ChartDataModel {
      completion_trend,
      categories: category_items,
      daily_activity,
    }
  }

  async fn compute_completion_trend(tasks: &[Value]) -> Vec<CompletionTrendItem> {
    let pipeline = AggregationPipeline::new()
      .match_stage(serde_json::json!({ "status": { "$in": ["completed", "skipped"] } }));

    let matched_tasks = pipeline
      .execute_docs(tasks.to_vec())
      .await
      .unwrap_or_default();

    let mut completion_by_weekday: HashMap<Weekday, (i32, i32)> = HashMap::new();

    for task in matched_tasks {
      if let Some(updated_at) = task.get("updated_at").and_then(|v| v.as_str()) {
        if let Ok(dt_updated) = chrono::DateTime::parse_from_rfc3339(updated_at) {
          let weekday = dt_updated.weekday();
          let entry = completion_by_weekday.entry(weekday).or_insert((0, 0));
          entry.1 += 1;
          entry.0 += 1;
        }
      }
    }

    let all_tasks_pipeline = AggregationPipeline::new();
    let all_tasks = all_tasks_pipeline
      .execute_docs(tasks.to_vec())
      .await
      .unwrap_or_default();

    for task in all_tasks {
      if let Some(updated_at) = task.get("updated_at").and_then(|v| v.as_str()) {
        if let Ok(dt_updated) = chrono::DateTime::parse_from_rfc3339(updated_at) {
          let weekday = dt_updated.weekday();
          let entry = completion_by_weekday.entry(weekday).or_insert((0, 0));
          entry.1 += 1;
        }
      }
    }

    let weekdays = [
      Weekday::Mon,
      Weekday::Tue,
      Weekday::Wed,
      Weekday::Thu,
      Weekday::Fri,
      Weekday::Sat,
      Weekday::Sun,
    ];

    weekdays
      .iter()
      .map(|&weekday| {
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

        CompletionTrendItem {
          label: day_name,
          value: percentage,
        }
      })
      .collect()
  }

  async fn compute_daily_activity(daily_activities: &[Value]) -> Vec<DailyActivityItem> {
    let pipeline = AggregationPipeline::new()
      .match_stage(serde_json::json!({ "total_activity": { "$gt": 0 } }))
      .group(
        GroupStage::new(serde_json::Value::Null)
          .sum("activity", serde_json::json!("$total_activity")),
      );

    let results = pipeline
      .execute_docs(daily_activities.to_vec())
      .await
      .unwrap_or_default();

    let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let mut activity_by_day: HashMap<String, i32> = HashMap::new();
    for day in &day_names {
      activity_by_day.insert(day.to_string(), 0);
    }

    for result in results {
      if let Some(total) = result.get("activity").and_then(|v| v.as_i64()) {
        for day in &day_names {
          let entry = activity_by_day.entry(day.to_string()).or_insert(0);
          *entry += total as i32;
        }
      }
    }

    day_names
      .iter()
      .map(|day| DailyActivityItem {
        day_name: day.to_string(),
        activity: *activity_by_day.get(*day).unwrap_or(&0),
      })
      .collect()
  }

  async fn compute_category_items(categories: &[Value]) -> Vec<CategoryItem> {
    let category_colors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];

    categories
      .iter()
      .enumerate()
      .filter_map(|(index, category)| {
        let category_title = category.get("title").and_then(|v| v.as_str())?;
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

        Some(CategoryItem {
          name: category_title.to_string(),
          count: total_tasks,
          percentage,
          color: category_colors[index % category_colors.len()].to_string(),
        })
      })
      .collect()
  }
}
