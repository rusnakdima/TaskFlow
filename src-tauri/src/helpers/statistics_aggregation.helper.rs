use crate::entities::statistics_entity::{
  CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem, DetailedMetricModel,
  StatisticsModel,
};
use chrono::{DateTime, Datelike, NaiveDate, Weekday};
use nosql_orm::aggregation::{AggregationPipeline, GroupStage};
use serde_json::Value;
use std::collections::HashMap;

pub struct StatisticsAggregation;

impl StatisticsAggregation {
  pub fn build_task_completion_pipeline(tasks: &[Value]) -> AggregationPipeline {
    AggregationPipeline::new()
      .match_stage(serde_json::json!({ "status": { "$in": ["completed", "skipped"] } }))
      .group(GroupStage::new(serde_json::Value::Null).sum("count", serde_json::json!(1)))
  }

  pub fn build_status_count_pipeline(status: &str) -> AggregationPipeline {
    AggregationPipeline::new()
      .match_stage(serde_json::json!({ "status": status }))
      .group(GroupStage::new(serde_json::Value::Null).sum("count", serde_json::json!(1)))
  }

  pub async fn calculate_average_task_time(tasks: &[Value]) -> i32 {
    let pipeline = AggregationPipeline::new()
      .match_stage(serde_json::json!({ "status": { "$in": ["completed", "skipped"] } }))
      .project(vec![
        ("created_at", serde_json::json!("$created_at")),
        ("updated_at", serde_json::json!("$updated_at")),
      ]);

    let results = pipeline
      .execute_docs(tasks.to_vec())
      .await
      .unwrap_or_default();
    let count = results.len();
    if count == 0 {
      return 0;
    }

    let mut total_duration = 0.0;
    for task in results {
      if let (Some(created_str), Some(updated_str)) = (
        task.get("created_at").and_then(|v| v.as_str()),
        task.get("updated_at").and_then(|v| v.as_str()),
      ) {
        if let (Ok(created), Ok(updated)) = (
          DateTime::parse_from_rfc3339(created_str),
          DateTime::parse_from_rfc3339(updated_str),
        ) {
          let duration = updated.signed_duration_since(created);
          let seconds = duration.num_seconds() as f32;
          let hours = seconds / 3600.0;
          total_duration += hours;
        }
      }
    }
    (total_duration / count as f32) as i32
  }

  pub async fn compute_statistics_from_docs(
    daily_activities: &[Value],
    previous_daily_activities: &[Value],
    tasks: &[Value],
    previous_tasks: &[Value],
  ) -> StatisticsModel {
    let (total_tasks, completed_tasks) = Self::compute_activity_totals(daily_activities).await;
    let completion_rate = if total_tasks > 0 {
      ((completed_tasks as f32 / total_tasks as f32) * 100.0) as i32
    } else {
      0
    };
    let average_task_time = Self::calculate_average_task_time(tasks).await;
    let productivity_score = Self::compute_productivity_score(daily_activities).await;

    let (previous_total_tasks, previous_completed_tasks) =
      Self::compute_activity_totals(previous_daily_activities).await;
    let previous_completion_rate = if previous_total_tasks > 0 {
      ((previous_completed_tasks as f32 / previous_total_tasks as f32) * 100.0) as i32
    } else {
      0
    };
    let previous_average_time = Self::calculate_average_task_time(previous_tasks).await;
    let previous_productivity_score =
      Self::compute_productivity_score(previous_daily_activities).await;

    StatisticsModel {
      total_tasks,
      completion_rate,
      average_task_time,
      productivity_score,
      previous_total_tasks,
      previous_completion_rate,
      previous_average_time,
      previous_productivity_score,
    }
  }

  async fn compute_activity_totals(daily_activities: &[Value]) -> (i32, i32) {
    let pipeline = AggregationPipeline::new().group(
      GroupStage::new(serde_json::Value::Null)
        .sum(
          "total_tasks",
          serde_json::json!({ "$sum": ["$tasks_created", "$tasks_updated", "$tasks_completed"] }),
        )
        .sum("completed", serde_json::json!("$tasks_completed")),
    );

    let results = pipeline
      .execute_docs(daily_activities.to_vec())
      .await
      .unwrap_or_default();
    if let Some(result) = results.first() {
      let total = result
        .get("total_tasks")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i32;
      let completed = result
        .get("completed")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i32;
      (total, completed)
    } else {
      (0, 0)
    }
  }

  async fn compute_productivity_score(daily_activities: &[Value]) -> i32 {
    if daily_activities.is_empty() {
      return 0;
    }

    let pipeline = AggregationPipeline::new().group(GroupStage::new(serde_json::Value::Null).sum(
      "score",
      serde_json::json!({ "$sum": [
          "$todos_created", "$todos_updated", "$todos_deleted",
          "$tasks_created", "$tasks_completed",
          "$subtasks_created", "$subtasks_completed"
        ] }),
    ));

    let results = pipeline
      .execute_docs(daily_activities.to_vec())
      .await
      .unwrap_or_default();
    if let Some(result) = results.first() {
      let score = result.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
      (score / daily_activities.len() as f32) as i32
    } else {
      0
    }
  }

  pub async fn compute_detailed_metrics_from_docs(
    daily_activities: &[Value],
    previous_daily_activities: &[Value],
  ) -> Vec<DetailedMetricModel> {
    let current_metrics = Self::compute_metric_sums(daily_activities).await;
    let previous_metrics = Self::compute_metric_sums(previous_daily_activities).await;

    let calculate_change = |current: i32, previous: i32| -> i32 {
      if previous == 0 {
        if current > 0 {
          100
        } else {
          0
        }
      } else {
        (((current as f32 - previous as f32) / previous as f32) * 100.0) as i32
      }
    };

    vec![
      DetailedMetricModel {
        name: "Tasks Created".to_string(),
        current: current_metrics.0.to_string(),
        previous: previous_metrics.0.to_string(),
        change: calculate_change(current_metrics.0, previous_metrics.0),
      },
      DetailedMetricModel {
        name: "Tasks Completed".to_string(),
        current: current_metrics.1.to_string(),
        previous: previous_metrics.1.to_string(),
        change: calculate_change(current_metrics.1, previous_metrics.1),
      },
      DetailedMetricModel {
        name: "Weekly Active Days".to_string(),
        current: current_metrics.2.to_string(),
        previous: previous_metrics.2.to_string(),
        change: calculate_change(current_metrics.2, previous_metrics.2),
      },
    ]
  }

  async fn compute_metric_sums(daily_activities: &[Value]) -> (i32, i32, i32) {
    let pipeline = AggregationPipeline::new().group(
      GroupStage::new(serde_json::Value::Null)
        .sum("tasks_created", serde_json::json!("$tasks_created"))
        .sum("tasks_completed", serde_json::json!("$tasks_completed"))
        .sum(
          "active_days",
          serde_json::json!({ "$cond": [{ "$gt": ["$total_tasks", 0] }, 1, 0] }),
        ),
    );

    let results = pipeline
      .execute_docs(daily_activities.to_vec())
      .await
      .unwrap_or_default();
    if let Some(result) = results.first() {
      (
        result
          .get("tasks_created")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32,
        result
          .get("tasks_completed")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32,
        result
          .get("active_days")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32,
      )
    } else {
      (0, 0, 0)
    }
  }

  pub async fn compute_chart_data_from_docs(
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
    let mut activity_by_day: HashMap<String, i32> = HashMap::new();
    let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for day in &day_names {
      activity_by_day.insert(day.to_string(), 0);
    }

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
