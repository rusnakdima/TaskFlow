use crate::entities::statistics_entity::{DetailedMetricModel, StatisticsModel};
use chrono::DateTime;
use serde_json::Value;

pub struct TaskAnalytics;

impl TaskAnalytics {
  pub fn calculate_average_task_time(tasks: &[Value]) -> i32 {
    let completed_tasks: Vec<_> = tasks
      .iter()
      .filter(|task| {
        if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
          status == "completed" || status == "skipped"
        } else {
          false
        }
      })
      .collect();

    let count = completed_tasks.len();
    if count == 0 {
      return 0;
    }

    let mut total_duration = 0.0;
    for task in completed_tasks {
      if let Some(created_str) = task.get("created_at").and_then(|v| v.as_str()) {
        if let Some(updated_str) = task.get("updated_at").and_then(|v| v.as_str()) {
          if let Ok(created) = DateTime::parse_from_rfc3339(created_str) {
            if let Ok(updated) = DateTime::parse_from_rfc3339(updated_str) {
              let duration = updated.signed_duration_since(created);
              let seconds = duration.num_seconds() as f32;
              let hours = seconds / 3600.0;
              total_duration += hours;
            }
          }
        }
      }
    }
    (total_duration / count as f32) as i32
  }

  pub fn compute_statistics(
    daily_activities: &[Value],
    previous_daily_activities: &[Value],
    tasks: &[Value],
    previous_tasks: &[Value],
  ) -> StatisticsModel {
    let total_tasks = daily_activities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let completed_tasks = daily_activities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let completion_rate = if total_tasks > 0 {
      ((completed_tasks as f32 / total_tasks as f32) * 100.0) as i32
    } else {
      0
    };

    let average_task_time = Self::calculate_average_task_time(tasks);

    let productivity_score = if !daily_activities.is_empty() {
      let total_score: i32 = daily_activities
        .iter()
        .filter_map(|activity| activity.get("productivity_score").and_then(|v| v.as_i64()))
        .sum::<i64>() as i32;
      total_score / daily_activities.len() as i32
    } else {
      0
    };

    let previous_total_tasks = previous_daily_activities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previous_completed_tasks = previous_daily_activities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previous_completion_rate = if previous_total_tasks > 0 {
      ((previous_completed_tasks as f32 / previous_total_tasks as f32) * 100.0) as i32
    } else {
      0
    };

    let previous_average_time = Self::calculate_average_task_time(previous_tasks);

    let previous_productivity_score = if !previous_daily_activities.is_empty() {
      let total_score: i32 = previous_daily_activities
        .iter()
        .filter_map(|activity| activity.get("productivity_score").and_then(|v| v.as_i64()))
        .sum::<i64>() as i32;
      total_score / previous_daily_activities.len() as i32
    } else {
      0
    };

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

  pub fn compute_detailed_metrics(
    daily_activities: &Vec<Value>,
    previous_daily_activities: &Vec<Value>,
  ) -> Vec<DetailedMetricModel> {
    let current_tasks_created = daily_activities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let current_tasks_completed = daily_activities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let current_weekly_active_days = daily_activities
      .iter()
      .filter(|activity| {
        activity
          .get("total_tasks")
          .and_then(|v| v.as_i64())
          .unwrap_or(0)
          > 0
      })
      .count() as i32;

    let previous_tasks_created = previous_daily_activities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previous_tasks_completed = previous_daily_activities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previous_weekly_active_days = previous_daily_activities
      .iter()
      .filter(|activity| {
        activity
          .get("total_tasks")
          .and_then(|v| v.as_i64())
          .unwrap_or(0)
          > 0
      })
      .count() as i32;

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
        current: current_tasks_created.to_string(),
        previous: previous_tasks_created.to_string(),
        change: calculate_change(current_tasks_created, previous_tasks_created),
      },
      DetailedMetricModel {
        name: "Tasks Completed".to_string(),
        current: current_tasks_completed.to_string(),
        previous: previous_tasks_completed.to_string(),
        change: calculate_change(current_tasks_completed, previous_tasks_completed),
      },
      DetailedMetricModel {
        name: "Weekly Active Days".to_string(),
        current: current_weekly_active_days.to_string(),
        previous: previous_weekly_active_days.to_string(),
        change: calculate_change(current_weekly_active_days, previous_weekly_active_days),
      },
    ]
  }
}
