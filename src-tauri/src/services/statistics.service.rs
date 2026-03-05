/* sys lib */
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Utc, Weekday};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  statistics_model::{
    CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem, DetailedMetricModel,
    StatisticsModel, StatisticsResponseModel,
  },
  sync_metadata_model::SyncMetadata,
};

#[derive(Clone)]
pub struct StatisticsService {
  pub jsonProvider: JsonProvider,
  pub activityLogHelper: Arc<ActivityLogHelper>,
}

impl StatisticsService {
  pub fn new(
    jsonProvider: JsonProvider,
    _mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: Arc<ActivityLogHelper>,
  ) -> Self {
    Self {
      jsonProvider: jsonProvider.clone(),
      activityLogHelper: activityLogHelper.clone(),
    }
  }

  pub async fn getStatistics(
    &self,
    userId: String,
    timeRange: String,
    _syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let (startDate, endDate) = self.calculateDateRange(&timeRange);

    let duration = endDate - startDate;
    let prevEndDate = startDate;
    let prevStartDate = startDate - duration;

    // Get all todos for the user
    let todosResponse = self
      .jsonProvider
      .getAll("todo", Some(json!({ "userId": userId.clone() })), None)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: e.to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let todos = todosResponse;

    // Extract tasks from todos
    let mut tasks = Vec::new();
    let mut subtasks = Vec::new();

    for todo in &todos {
      if let Some(todoTasks) = todo.get("tasks").and_then(|v| v.as_array()) {
        for task in todoTasks {
          tasks.push(task.clone());
          if let Some(taskSubtasks) = task.get("subtasks").and_then(|v| v.as_array()) {
            for subtask in taskSubtasks {
              subtasks.push(subtask.clone());
            }
          }
        }
      }
    }

    // Get categories
    let categoriesResponse = self
      .jsonProvider
      .getAll("category", Some(json!({ "userId": userId.clone() })), None)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: e.to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let categories = categoriesResponse;

    let originalTodos = todos.clone();
    let filteredTodos = self.filterByDateRange(&todos, &startDate, &endDate, "createdAt");
    let filteredTasks = self.filterByDateRange(&tasks, &startDate, &endDate, "createdAt");

    let previousTodos =
      self.filterByDateRange(&originalTodos, &prevStartDate, &prevEndDate, "createdAt");

    let mut previousTasks = Vec::new();
    for todo in &previousTodos {
      if let Some(todoTasks) = todo.get("tasks").and_then(|v| v.as_array()) {
        for task in todoTasks {
          previousTasks.push(task.clone());
        }
      }
    }

    let startDateNaive = startDate.date_naive();
    let endDateNaive = endDate.date_naive();
    let dailyActivities = self
      .getDailyActivitiesFiltered(&userId, &startDateNaive, &endDateNaive)
      .await;

    let prev_startDateNaive = prevStartDate.date_naive();
    let prev_endDateNaive = prevEndDate.date_naive();
    let previousDailyActivities = self
      .getDailyActivitiesFiltered(&userId, &prev_startDateNaive, &prev_endDateNaive)
      .await;

    let statistics = self.computeStatistics(
      &dailyActivities,
      &previousDailyActivities,
      &filteredTasks,
      &previousTasks,
    );
    let chartData = self.computeChartData(
      &filteredTasks,
      &categories,
      &dailyActivities,
      &startDateNaive,
      &endDateNaive,
    );
    let achievements = vec![]; // computeAchievements removed - not implemented
    let detailedMetrics = self.computeDetailedMetrics(&dailyActivities, &previousDailyActivities);

    let response = StatisticsResponseModel {
      statistics,
      chartData: chartData,
      achievements,
      detailedMetrics: detailedMetrics,
    };

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::Object(serde_json::to_value(response).map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error serializing response: {}", e),
        data: DataValue::String("".to_string()),
      })?),
    })
  }

  fn calculateDateRange(&self, timeRange: &str) -> (DateTime<Local>, DateTime<Local>) {
    let now = Utc::now().with_timezone(&Local);
    let endDate = now;

    let startDate = match timeRange {
      "day" => now - Duration::days(1),
      "week" => now - Duration::days(7),
      "month" => now - Duration::days(30),
      "quarter" => now - Duration::days(90),
      "year" => now - Duration::days(365),
      _ => now - Duration::days(7),
    };

    (startDate, endDate)
  }

  fn filterByDateRange(
    &self,
    items: &Vec<Value>,
    startDate: &DateTime<Local>,
    endDate: &DateTime<Local>,
    dateField: &str,
  ) -> Vec<Value> {
    items
      .iter()
      .filter(|item| {
        if let Some(date_str) = item.get(dateField).and_then(|v| v.as_str()) {
          if let Ok(dt) = DateTime::parse_from_rfc3339(date_str) {
            let dtLocal = dt.with_timezone(&Local);
            return dtLocal >= *startDate && dtLocal <= *endDate;
          }
        }
        false
      })
      .cloned()
      .collect()
  }

  async fn getDailyActivitiesFiltered(
    &self,
    userId: &str,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
  ) -> Vec<Value> {
    let activitiesResponse = self
      .activityLogHelper
      .getAll(json!({"userId".to_string(): userId.to_string()}))
      .await;

    let activities = match activitiesResponse {
      Ok(response) => {
        if let DataValue::Array(data) = response.data {
          data
        } else {
          Vec::new()
        }
      }
      Err(_) => {
        return Vec::new();
      }
    };

    activities
      .into_iter()
      .filter(|activity| {
        if let Some(date_str) = activity.get("date").and_then(|v| v.as_str()) {
          if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            return date >= *startDate && date <= *endDate;
          }
        }
        false
      })
      .collect()
  }

  fn calculateAverageTaskTime(&self, tasks: &Vec<Value>) -> i32 {
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
      if let Some(created_str) = task.get("createdAt").and_then(|v| v.as_str()) {
        if let Some(updated_str) = task.get("updatedAt").and_then(|v| v.as_str()) {
          if let Ok(created) = DateTime::parse_from_rfc3339(created_str) {
            if let Ok(updated) = DateTime::parse_from_rfc3339(updated_str) {
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

  fn computeStatistics(
    &self,
    dailyActivities: &Vec<Value>,
    previousDailyActivities: &Vec<Value>,
    tasks: &Vec<Value>,
    previousTasks: &Vec<Value>,
  ) -> StatisticsModel {
    let totalTasks = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("totalTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let completedTasks = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("completedTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let completionRate = if totalTasks > 0 {
      ((completedTasks as f32 / totalTasks as f32) * 100.0) as i32
    } else {
      0
    };

    let averageTaskTime = self.calculateAverageTaskTime(tasks);

    let productivityScore = if !dailyActivities.is_empty() {
      let totalScore: i32 = dailyActivities
        .iter()
        .filter_map(|activity| activity.get("productivityScore").and_then(|v| v.as_i64()))
        .sum::<i64>() as i32;
      totalScore / dailyActivities.len() as i32
    } else {
      0
    };

    let previousTotalTasks = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("totalTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousCompletedTasks = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("completedTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousCompletionRate = if previousTotalTasks > 0 {
      ((previousCompletedTasks as f32 / previousTotalTasks as f32) * 100.0) as i32
    } else {
      0
    };

    let previousAverageTime = self.calculateAverageTaskTime(previousTasks);

    let previous_productivityScore = if !previousDailyActivities.is_empty() {
      let totalScore: i32 = previousDailyActivities
        .iter()
        .filter_map(|activity| activity.get("productivityScore").and_then(|v| v.as_i64()))
        .sum::<i64>() as i32;
      totalScore / previousDailyActivities.len() as i32
    } else {
      0
    };

    StatisticsModel {
      totalTasks: totalTasks,
      completionRate: completionRate,
      averageTaskTime: averageTaskTime,
      productivityScore: productivityScore,
      previousTotalTasks: previousTotalTasks,
      previousCompletionRate: previousCompletionRate,
      previousAverageTime: previousAverageTime,
      previousProductivityScore: previous_productivityScore,
    }
  }

  fn computeChartData(
    &self,
    tasks: &Vec<Value>,
    categories: &Vec<Value>,
    dailyActivities: &Vec<Value>,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
  ) -> ChartDataModel {
    let mut completionByWeekday: HashMap<Weekday, (i32, i32)> = HashMap::new();

    for task in tasks {
      if let Some(updated_at) = task.get("updatedAt").and_then(|v| v.as_str()) {
        if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
          if let Ok(dtUpdated) = DateTime::parse_from_rfc3339(updated_at) {
            let weekday = dtUpdated.weekday();
            let entry = completionByWeekday.entry(weekday).or_insert((0, 0));
            entry.1 += 1;
            if status == "completed" || status == "skipped" {
              entry.0 += 1;
            }
          }
        }
      }
    }

    let mut completionTrend = Vec::new();
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
      let dayName = match weekday {
        Weekday::Mon => "Monday",
        Weekday::Tue => "Tuesday",
        Weekday::Wed => "Wednesday",
        Weekday::Thu => "Thursday",
        Weekday::Fri => "Friday",
        Weekday::Sat => "Saturday",
        Weekday::Sun => "Sunday",
      }
      .to_string();

      let (completed, total) = completionByWeekday.get(&weekday).unwrap_or(&(0, 0));
      let percentage = if *total > 0 {
        (*completed as f32 / *total as f32 * 100.0) as i32
      } else {
        0
      };

      completionTrend.push(CompletionTrendItem {
        label: dayName,
        value: percentage,
      });
    }

    let mut dailyActivity_map: HashMap<String, i32> = HashMap::new();

    let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for day in &dayNames {
      dailyActivity_map.insert(day.to_string(), 0);
    }

    for activity in dailyActivities {
      if let Some(date_str) = activity.get("date").and_then(|v| v.as_str()) {
        if let Some(totalActivity) = activity.get("totalActivity").and_then(|v| v.as_i64()) {
          if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            let weekday = date.weekday();
            let dayIndex = match weekday {
              Weekday::Mon => 0,
              Weekday::Tue => 1,
              Weekday::Wed => 2,
              Weekday::Thu => 3,
              Weekday::Fri => 4,
              Weekday::Sat => 5,
              Weekday::Sun => 6,
            };
            let dayName = dayNames[dayIndex];
            *dailyActivity_map.get_mut(dayName).unwrap() += totalActivity as i32;
          }
        }
      }
    }

    let dailyActivity: Vec<DailyActivityItem> = dayNames
      .iter()
      .map(|day| DailyActivityItem {
        dayName: day.to_string(),
        activity: *dailyActivity_map.get(*day).unwrap_or(&0),
      })
      .collect();

    let categoryColors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];
    let mut categoryItems = Vec::new();

    for (index, category) in categories.iter().enumerate() {
      if let Some(categoryTitle) = category.get("title").and_then(|v| v.as_str()) {
        let mut totalTasks = 0;
        let mut completedTasks = 0;

        if let Some(todos) = category.get("todos").and_then(|v| v.as_array()) {
          for todo in todos {
            if let Some(created_at) = todo.get("createdAt").and_then(|v| v.as_str()) {
              if let Ok(dt) = DateTime::parse_from_rfc3339(created_at) {
                let date = dt.date_naive();
                if date >= *startDate && date <= *endDate {
                  if let Some(tasks) = todo.get("tasks").and_then(|v| v.as_array()) {
                    for task in tasks {
                      totalTasks += 1;
                      if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
                        if status == "completed" || status == "skipped" {
                          completedTasks += 1;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        let percentage = if totalTasks > 0 {
          ((completedTasks as f32 / totalTasks as f32) * 100.0) as i32
        } else {
          0
        };

        categoryItems.push(CategoryItem {
          name: categoryTitle.to_string(),
          count: totalTasks,
          percentage,
          color: categoryColors[index % categoryColors.len()].to_string(),
        });
      }
    }

    ChartDataModel {
      completionTrend: completionTrend,
      categories: categoryItems,
      dailyActivity: dailyActivity,
    }
  }

  fn computeDetailedMetrics(
    &self,
    dailyActivities: &Vec<Value>,
    previousDailyActivities: &Vec<Value>,
  ) -> Vec<DetailedMetricModel> {
    let currentTasksCreated = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("totalTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let currentTasksCompleted = dailyActivities
      .iter()
      .filter_map(|activity| activity.get("completedTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let currentWeeklyActiveDays = dailyActivities
      .iter()
      .filter(|activity| {
        activity
          .get("totalTasks")
          .and_then(|v| v.as_i64())
          .unwrap_or(0)
          > 0
      })
      .count() as i32;

    let previousTasksCreated = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("totalTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousTasksCompleted = previousDailyActivities
      .iter()
      .filter_map(|activity| activity.get("completedTasks").and_then(|v| v.as_i64()))
      .sum::<i64>() as i32;

    let previousWeeklyActiveDays = previousDailyActivities
      .iter()
      .filter(|activity| {
        activity
          .get("totalTasks")
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
