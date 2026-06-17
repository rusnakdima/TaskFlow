use crate::entities::statistics_entity::{DetailedMetricModel, StatisticsModel};
use crate::utils::percentage::calculate_percentage;
use chrono::DateTime;
use nosql_orm::aggregation::{AggregationPipeline, GroupStage};
use serde_json::Value;

pub struct TaskAnalytics;

impl TaskAnalytics {
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

  pub async fn compute_statistics(
    daily_activities: &[Value],
    previous_daily_activities: &[Value],
    tasks: &[Value],
    previous_tasks: &[Value],
  ) -> StatisticsModel {
    let (total_tasks, completed_tasks) = Self::compute_activity_totals(daily_activities).await;
    let completion_rate = calculate_percentage(completed_tasks, total_tasks);
    let average_task_time = Self::calculate_average_task_time(tasks).await;
    let productivity_score = Self::compute_productivity_score(daily_activities).await;

    let (previous_total_tasks, previous_completed_tasks) =
      Self::compute_activity_totals(previous_daily_activities).await;
    let previous_completion_rate =
      calculate_percentage(previous_completed_tasks, previous_total_tasks);
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

  pub async fn compute_detailed_metrics(
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
          serde_json::json!({ "$cond": [{ "$gt": [{ "$sum": ["$tasks_created", "$tasks_completed", "$tasks_updated"] }, 0] }, 1, 0] }),
        ),
    );

    let results = pipeline
      .execute_docs(daily_activities.to_vec())
      .await
      .unwrap_or_default();
    if let Some(result) = results.first() {
      let tasks_created = result
        .get("tasks_created")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i32;
      let tasks_completed = result
        .get("tasks_completed")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i32;
      let active_days = result
        .get("active_days")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i32;

      (tasks_created, tasks_completed, active_days)
    } else {
      (0, 0, 0)
    }
  }
}
