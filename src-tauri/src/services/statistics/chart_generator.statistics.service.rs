use crate::entities::statistics_entity::{
  CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem,
};
use chrono::{Datelike, NaiveDate, Weekday};
use nosql_orm::aggregation::AggregationPipeline;
use serde_json::Value;
use std::collections::HashMap;

pub struct ChartGenerator;

impl ChartGenerator {
  pub async fn compute_chart_data(
    tasks: &[Value],
    categories: &[Value],
    todos: &[Value],
    daily_activities: &[Value],
    _start_date: &NaiveDate,
    _end_date: &NaiveDate,
  ) -> ChartDataModel {
    let completion_trend = Self::compute_completion_trend(tasks).await;
    let daily_activity = Self::compute_daily_activity(daily_activities).await;
    let category_items = Self::compute_category_items(categories, todos, tasks).await;

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

    let result: Vec<CompletionTrendItem> = weekdays
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
      .collect();

    result
  }

  async fn compute_daily_activity(daily_activities: &[Value]) -> Vec<DailyActivityItem> {
    let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let mut activity_by_day: HashMap<String, i32> = HashMap::new();
    for day in &day_names {
      activity_by_day.insert(day.to_string(), 0);
    }

    for activity in daily_activities {
      if let Some(date_str) = activity.get("date").and_then(|v| v.as_str()) {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
          let weekday = date.weekday();
          let day_name = match weekday {
            chrono::Weekday::Mon => "Mon",
            chrono::Weekday::Tue => "Tue",
            chrono::Weekday::Wed => "Wed",
            chrono::Weekday::Thu => "Thu",
            chrono::Weekday::Fri => "Fri",
            chrono::Weekday::Sat => "Sat",
            chrono::Weekday::Sun => "Sun",
          };
          if let Some(total_activity) = activity.get("total_activity").and_then(|v| v.as_i64()) {
            let entry = activity_by_day.entry(day_name.to_string()).or_insert(0);
            *entry += total_activity as i32;
          }
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

  async fn compute_category_items(
    categories: &[Value],
    _todos: &[Value],
    _tasks: &[Value],
  ) -> Vec<CategoryItem> {
    let category_colors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];

    let result: Vec<CategoryItem> = categories
      .iter()
      .enumerate()
      .filter_map(|(index, category)| {
        let category_title = category.get("title").and_then(|v| v.as_str());
        let category_name = category.get("name").and_then(|v| v.as_str());
        let title = category_title.or(category_name);

        if title.is_none() {
          eprintln!(
            "[ChartGenerator] category missing title/name: {:?}",
            category
          );
          return None;
        }

        let total_tasks = category
          .get("task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;
        let total_tasks_alt = category
          .get("total_tasks")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;
        let tasks_count = if total_tasks == 0 && total_tasks_alt > 0 {
          total_tasks_alt
        } else {
          total_tasks
        };

        let completed_tasks = category
          .get("completed_task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;
        let completed_tasks_alt = category
          .get("completed")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;
        let completed_count = if completed_tasks == 0 && completed_tasks_alt > 0 {
          completed_tasks_alt
        } else {
          completed_tasks
        };

        let percentage = if tasks_count > 0 {
          ((completed_count as f32 / tasks_count as f32) * 100.0) as i32
        } else {
          0
        };

        Some(CategoryItem {
          name: title.unwrap().to_string(),
          count: tasks_count,
          percentage,
          color: category_colors[index % category_colors.len()].to_string(),
        })
      })
      .collect();

    result
  }
}
