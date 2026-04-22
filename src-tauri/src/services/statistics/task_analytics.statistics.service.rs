use crate::entities::statistics_entity::{DetailedMetricModel, StatisticsModel};
use chrono::DateTime;
use serde_json::Value;

pub struct TaskAnalytics;

impl TaskAnalytics {
  pub fn calculateAverageTaskTime(tasks: &Vec<Value>) -> i32 {
    let completedTasks: Vec<_> = tasks
      .iter()
      .filter(|task| {
        if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
          status == "completed" || status == "skipped"
        } else {
          false
        }
      })
      .collect();

    let count = completedTasks.len();
    if count == 0 {
      return 0;
    }

    let mut totalDuration = 0.0;
    for task in completedTasks {
      if let Some(createdStr) = task.get("created_at").and_then(|v| v.as_str()) {
        if let Some(updatedStr) = task.get("updated_at").and_then(|v| v.as_str()) {
          if let Ok(created) = DateTime::parse_from_rfc3339(createdStr) {
            if let Ok(updated) = DateTime::parse_from_rfc3339(updatedStr) {
              let duration = updated.signed_duration_since(created);
              let seconds = duration.num_seconds() as f32;
              let hours = seconds / 3600.0;
              totalDuration += hours;
            }
          }
        }
      }
    }
    (totalDuration / count as f32) as i32
  }

  pub fn computeStatistics(
    dailyActivities: &Vec<Value>,
    previousDailyActivities: &Vec<Value>,
    tasks: &Vec<Value>,
    previousTasks: &Vec<Value>,
  ) -> StatisticsModel {
    let totalTasks = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let completedTasks = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let completionRate = if totalTasks > 0 {
      ((completedTasks as f32 / totalTasks as f32) * 100.0) as i32
    } else {
      0
    };

    let averageTaskTime = Self::calculateAverageTaskTime(tasks);

    let productivityScore = if !dailyActivities.is_empty() {
      let totalScore: i32 = dailyActivities
        .iter()
        .filter_map(|activity| activity.get("productivity_score").and_then(|v| v.as_i64()))
        .sum::<i64>() as i32;
      totalScore / dailyActivities.len() as i32
    } else {
      0
    };

    let previousTotalTasks = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousCompletedTasks = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousCompletionRate = if previousTotalTasks > 0 {
      ((previousCompletedTasks as f32 / previousTotalTasks as f32) * 100.0) as i32
    } else {
      0
    };

    let previousAverageTime = Self::calculateAverageTaskTime(previousTasks);

    let previousProductivityScore = if !previousDailyActivities.is_empty() {
      let totalScore: i32 = previousDailyActivities
        .iter()
        .filter_map(|activity| activity.get("productivity_score").and_then(|v| v.as_i64()))
        .sum::<i64>() as i32;
      totalScore / previousDailyActivities.len() as i32
    } else {
      0
    };

    StatisticsModel {
      totalTasks,
      completionRate,
      averageTaskTime,
      productivityScore,
      previousTotalTasks,
      previousCompletionRate,
      previousAverageTime,
      previousProductivityScore,
    }
  }

  pub fn computeDetailedMetrics(
    dailyActivities: &Vec<Value>,
    previousDailyActivities: &Vec<Value>,
  ) -> Vec<DetailedMetricModel> {
    let currentTasksCreated = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let currentTasksCompleted = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let currentWeeklyActiveDays = dailyActivities
      .iter()
      .filter(|activity| {
        activity
          .get("total_tasks")
          .and_then(|v| v.as_i64())
          .unwrap_or(0)
          > 0
      })
      .count() as i32;

    let previousTasksCreated = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("total_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousTasksCompleted = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("completed_tasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousWeeklyActiveDays = previousDailyActivities
      .iter()
      .filter(|activity| {
        activity
          .get("total_tasks")
          .and_then(|v| v.as_i64())
          .unwrap_or(0)
          > 0
      })
      .count() as i32;

    let calculateChange = |current: i32, previous: i32| -> i32 {
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
        current: currentTasksCreated.to_string(),
        previous: previousTasksCreated.to_string(),
        change: calculateChange(currentTasksCreated, previousTasksCreated),
      },
      DetailedMetricModel {
        name: "Tasks Completed".to_string(),
        current: currentTasksCompleted.to_string(),
        previous: previousTasksCompleted.to_string(),
        change: calculateChange(currentTasksCompleted, previousTasksCompleted),
      },
      DetailedMetricModel {
        name: "Weekly Active Days".to_string(),
        current: currentWeeklyActiveDays.to_string(),
        previous: previousWeeklyActiveDays.to_string(),
        change: calculateChange(currentWeeklyActiveDays, previousWeeklyActiveDays),
      },
    ]
  }
}
