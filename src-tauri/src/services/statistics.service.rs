/* sys lib */
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Utc, Weekday};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;

/* providers */
use crate::providers::json_provider::JsonProvider;

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
  pub fn new(jsonProvider: JsonProvider, activityLogHelper: Arc<ActivityLogHelper>) -> Self {
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
    let todos = self
      .jsonProvider
      .getAll("todos", Some(json!({ "userId": userId.clone() })), None)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: e.to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let todoIds: Vec<Value> = todos
      .iter()
      .filter_map(|todo| todo.get("id").cloned())
      .collect();

    // Get all tasks for these todos
    let tasks = self
      .jsonProvider
      .getAll("tasks", Some(json!({ "todoId": todoIds })), None)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: e.to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let taskIds: Vec<Value> = tasks
      .iter()
      .filter_map(|task| task.get("id").cloned())
      .collect();

    // Get all subtasks for these tasks
    let _subtasks = self
      .jsonProvider
      .getAll("subtasks", Some(json!({ "taskId": taskIds })), None)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: e.to_string(),
        data: DataValue::String("".to_string()),
      })?;

    // Get categories
    let categories = self
      .jsonProvider
      .getAll("categories", Some(json!({ "userId": userId.clone() })), None)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: e.to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let filteredTasks = self.filterByDateRange(&tasks, &startDate, &endDate, "createdAt");

    let previousTasks =
      self.filterByDateRange(&tasks, &prevStartDate, &prevEndDate, "createdAt");

    let startDateNaive = startDate.date_naive();
    let endDateNaive = endDate.date_naive();
    let dailyActivities = self
      .getDailyActivitiesFiltered(&userId, &startDateNaive, &endDateNaive)
      .await;

    // Calculate tasks per category from todos and tasks
    let categoriesWithCounts = self.calculateCategoryTasks(
      &categories,
      &todos,
      &tasks,
      &startDateNaive,
      &endDateNaive,
    );

    let prevStartDateNaive = prevStartDate.date_naive();
    let prevEndDateNaive = prevEndDate.date_naive();
    let previousDailyActivities = self
      .getDailyActivitiesFiltered(&userId, &prevStartDateNaive, &prevEndDateNaive)
      .await;

    let statistics = self.computeStatistics(
      &dailyActivities,
      &previousDailyActivities,
      &filteredTasks,
      &previousTasks,
    );
    let chartData = self.computeChartData(
      &filteredTasks,
      &categoriesWithCounts,
      &dailyActivities,
      &startDateNaive,
      &endDateNaive,
    );
    let achievements = vec![]; // computeAchievements removed - not implemented
    let detailedMetrics = self.computeDetailedMetrics(&dailyActivities, &previousDailyActivities);

    let response = StatisticsResponseModel {
      statistics,
      chartData,
      achievements,
      detailedMetrics,
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
        if let Some(dateStr) = item.get(dateField).and_then(|v| v.as_str()) {
          if let Ok(dt) = DateTime::parse_from_rfc3339(dateStr) {
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
        if let Some(dateStr) = activity.get("date").and_then(|v| v.as_str()) {
          if let Ok(date) = NaiveDate::parse_from_str(dateStr, "%Y-%m-%d") {
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
      if let Some(createdStr) = task.get("createdAt").and_then(|v| v.as_str()) {
        if let Some(updatedStr) = task.get("updatedAt").and_then(|v| v.as_str()) {
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

    let previousProductivityScore = if !previousDailyActivities.is_empty() {
      let totalScore: i32 = previousDailyActivities
        .iter()
        .filter_map(|activity| activity.get("productivityScore").and_then(|v| v.as_i64()))
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

  fn calculateCategoryTasks(
    &self,
    categories: &Vec<Value>,
    todos: &Vec<Value>,
    tasks: &Vec<Value>,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
  ) -> Vec<Value> {
    let mut categoriesWithCounts = Vec::new();

    // Group tasks by todoId for efficient lookup
    let mut tasksByTodo: HashMap<String, Vec<Value>> = HashMap::new();
    for task in tasks {
      if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
        tasksByTodo
          .entry(todoId.to_string())
          .or_default()
          .push(task.clone());
      }
    }

    for category in categories {
      let mut categoryClone = category.clone();
      let mut categoryTodos = Vec::new();
      let mut categoryTaskCount = 0;
      let mut categoryCompletedTaskCount = 0;

      let categoryId = category.get("id").and_then(|v| v.as_str()).unwrap_or("");

      for todo in todos {
        let mut hasCategory = false;
        if let Some(todoCategories) = todo.get("categories").and_then(|v| v.as_array()) {
          hasCategory = todoCategories.iter().any(|cat| {
            if let Some(catId) = cat.get("id").and_then(|v| v.as_str()) {
              return catId == categoryId;
            }
            if let Some(catId) = cat.as_str() {
              return catId == categoryId;
            }
            false
          });
        }

        if hasCategory {
          let mut todoHasRelevantTasks = false;
          let todoId = todo.get("id").and_then(|v| v.as_str()).unwrap_or("");
          
          if let Some(todoTasks) = tasksByTodo.get(todoId) {
            for task in todoTasks {
              let mut isTaskInRange = false;
              if let Some(createdAtStr) = task.get("createdAt").and_then(|v| v.as_str()) {
                if let Ok(dt) = DateTime::parse_from_rfc3339(createdAtStr) {
                  let date = dt.date_naive();
                  if date >= *startDate && date <= *endDate {
                    isTaskInRange = true;
                  }
                }
              }

              if !isTaskInRange {
                if let Some(updatedAtStr) = task.get("updatedAt").and_then(|v| v.as_str()) {
                  if let Ok(dt) = DateTime::parse_from_rfc3339(updatedAtStr) {
                    let date = dt.date_naive();
                    if date >= *startDate && date <= *endDate {
                      isTaskInRange = true;
                    }
                  }
                }
              }

              if isTaskInRange {
                categoryTaskCount += 1;
                todoHasRelevantTasks = true;
                if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
                  if status == "completed" || status == "skipped" {
                    categoryCompletedTaskCount += 1;
                  }
                }
              }
            }
          }

          if todoHasRelevantTasks {
            categoryTodos.push(todo.clone());
          }
        }
      }

      if let Some(obj) = categoryClone.as_object_mut() {
        obj.insert("todos".to_string(), serde_json::Value::Array(categoryTodos));
        obj.insert("taskCount".to_string(), serde_json::Value::Number(categoryTaskCount.into()));
        obj.insert(
          "completedTaskCount".to_string(),
          serde_json::Value::Number(categoryCompletedTaskCount.into()),
        );
      }
      categoriesWithCounts.push(categoryClone);
    }

    categoriesWithCounts
  }

  fn computeChartData(
    &self,
    tasks: &Vec<Value>,
    categories: &Vec<Value>,
    dailyActivities: &Vec<Value>,
    _startDate: &NaiveDate,
    _endDate: &NaiveDate,
  ) -> ChartDataModel {
    let mut completionByWeekday: HashMap<Weekday, (i32, i32)> = HashMap::new();

    for task in tasks {
      if let Some(updatedAt) = task.get("updatedAt").and_then(|v| v.as_str()) {
        if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
          if let Ok(dtUpdated) = DateTime::parse_from_rfc3339(updatedAt) {
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

      let (completed, total) = completionByWeekday.get(&weekday).copied().unwrap_or((0, 0));
      let percentage = if total > 0 {
        (completed as f32 / total as f32 * 100.0) as i32
      } else {
        0
      };

      completionTrend.push(CompletionTrendItem {
        label: dayName,
        value: percentage,
      });
    }

    let mut dailyActivityMap: HashMap<String, i32> = HashMap::new();

    let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for day in &dayNames {
      dailyActivityMap.insert(day.to_string(), 0);
    }

    for activity in dailyActivities {
      if let Some(dateStr) = activity.get("date").and_then(|v| v.as_str()) {
        if let Some(totalActivity) = activity.get("totalActivity").and_then(|v| v.as_i64()) {
          if let Ok(date) = NaiveDate::parse_from_str(dateStr, "%Y-%m-%d") {
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
            if let Some(count) = dailyActivityMap.get_mut(dayName) {
              *count += totalActivity as i32;
            }
          }
        }
      }
    }

    let dailyActivity: Vec<DailyActivityItem> = dayNames
      .iter()
      .map(|day| DailyActivityItem {
        dayName: day.to_string(),
        activity: *dailyActivityMap.get(*day).unwrap_or(&0),
      })
      .collect();

    let categoryColors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];
    let mut categoryItems = Vec::new();

    for (index, category) in categories.iter().enumerate() {
      if let Some(categoryTitle) = category.get("title").and_then(|v| v.as_str()) {
        // Get task count from the pre-calculated taskCount field
        let totalTasks = category.get("taskCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

        // Get completed task count from the pre-calculated completedTaskCount field
        let completedTasks = category
          .get("completedTaskCount")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

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
      completionTrend,
      categories: categoryItems,
      dailyActivity,
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
