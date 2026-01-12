/* sys lib */
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Weekday};
use std::collections::HashMap;
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::{category_service::CategoriesService, todo_service::TodoService};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  statistics_model::{
    AchievementModel, CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem,
    DetailedMetricModel, StatisticsModel, StatisticsResponseModel,
  },
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct StatisticsService {
  pub jsonProvider: JsonProvider,
  pub todoService: TodoService,
  pub categoriesService: CategoriesService,
  pub activityLogHelper: ActivityLogHelper,
}

impl StatisticsService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      jsonProvider: jsonProvider.clone(),
      todoService: TodoService::new(
        jsonProvider.clone(),
        mongodbProvider,
        activityLogHelper.clone(),
      ),
      categoriesService: CategoriesService::new(jsonProvider),
      activityLogHelper,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getStatistics(
    &self,
    userId: String,
    timeRange: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let (startDate, endDate) = self.calculateDateRange(&timeRange);

    let duration = endDate - startDate;
    let prevEndDate = startDate;
    let prevStartDate = startDate - duration;

    let todosResponse = self
      .todoService
      .getAllByField("userId".to_string(), userId.clone())
      .await;
    let mut todos = match todosResponse {
      Ok(response) => {
        if let DataValue::Array(data) = response.data {
          data
        } else {
          Vec::new()
        }
      }
      Err(error) => {
        return Err(error);
      }
    };

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

    let categoriesResponse = self
      .categoriesService
      .getAllByField("userId".to_string(), userId.clone())
      .await;
    let categories = match categoriesResponse {
      Ok(response) => {
        if let DataValue::Array(data) = response.data {
          data
        } else {
          Vec::new()
        }
      }
      Err(error) => {
        return Err(error);
      }
    };

    let originalTodos = todos.clone();
    todos = self.filterByDateRange(todos, &startDate, &endDate, "createdAt");
    tasks = self.filterByDateRange(tasks, &startDate, &endDate, "createdAt");

    let previousTodos =
      self.filterByDateRange(originalTodos, &prevStartDate, &prevEndDate, "createdAt");
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

    let prevStartDateNaive = prevStartDate.date_naive();
    let prevEndDateNaive = prevEndDate.date_naive();
    let previousDailyActivities = self
      .getDailyActivitiesFiltered(&userId, &prevStartDateNaive, &prevEndDateNaive)
      .await;

    let statistics = self.computeStatistics(
      &dailyActivities,
      &previousDailyActivities,
      &tasks,
      &previousTasks,
    );
    let chartData = self.computeChartData(
      &tasks,
      &categories,
      &dailyActivities,
      &startDateNaive,
      &endDateNaive,
    );
    let achievements = self.computeAchievements(&todos, &tasks, &subtasks);
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
      data: DataValue::Object(serde_json::to_value(response).unwrap()),
    })
  }

  #[allow(non_snake_case)]
  fn calculateDateRange(&self, timeRange: &str) -> (DateTime<Local>, DateTime<Local>) {
    let now = Local::now();
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

  #[allow(non_snake_case)]
  fn filterByDateRange(
    &self,
    mut items: Vec<serde_json::Value>,
    startDate: &DateTime<Local>,
    endDate: &DateTime<Local>,
    dateField: &str,
  ) -> Vec<serde_json::Value> {
    items.retain(|item| {
      if let Some(dateStr) = item.get(dateField).and_then(|v| v.as_str()) {
        if let Ok(dt) = DateTime::parse_from_rfc3339(dateStr) {
          let dtLocal = dt.with_timezone(&Local);
          return dtLocal >= *startDate && dtLocal <= *endDate;
        }
      }
      false
    });
    items
  }

  #[allow(non_snake_case)]
  async fn getDailyActivitiesFiltered(
    &self,
    userId: &str,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
  ) -> Vec<serde_json::Value> {
    let activitiesResponse = self
      .activityLogHelper
      .getAllByField("userId".to_string(), userId.to_string())
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

  #[allow(non_snake_case)]
  fn calculateAverageTaskTime(&self, tasks: &Vec<serde_json::Value>) -> i32 {
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

  #[allow(non_snake_case)]
  fn computeStatistics(
    &self,
    dailyActivities: &Vec<serde_json::Value>,
    previousDailyActivities: &Vec<serde_json::Value>,
    tasks: &Vec<serde_json::Value>,
    previousTasks: &Vec<serde_json::Value>,
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
      totalTasks: totalTasks,
      completionRate: completionRate,
      averageTaskTime: averageTaskTime,
      productivityScore: productivityScore,
      previousTotalTasks: previousTotalTasks,
      previousCompletionRate: previousCompletionRate,
      previousAverageTime: previousAverageTime,
      previousProductivityScore: previousProductivityScore,
    }
  }

  #[allow(non_snake_case)]
  fn computeChartData(
    &self,
    tasks: &Vec<serde_json::Value>,
    categories: &Vec<serde_json::Value>,
    dailyActivities: &Vec<serde_json::Value>,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
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

    let mut dailyActivityMap: HashMap<String, i32> = HashMap::new();

    let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for day in &dayNames {
      dailyActivityMap.insert(day.to_string(), 0);
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
            *dailyActivityMap.get_mut(dayName).unwrap() += totalActivity as i32;
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
        let mut totalTasks = 0;
        let mut completedTasks = 0;

        if let Some(todos) = category.get("todos").and_then(|v| v.as_array()) {
          for todo in todos {
            if let Some(createdAt) = todo.get("createdAt").and_then(|v| v.as_str()) {
              if let Ok(dt) = DateTime::parse_from_rfc3339(createdAt) {
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
      dailyActivity,
    }
  }

  #[allow(non_snake_case)]
  fn computeAchievements(
    &self,
    _todos: &Vec<serde_json::Value>,
    _tasks: &Vec<serde_json::Value>,
    _subtasks: &Vec<serde_json::Value>,
  ) -> Vec<AchievementModel> {
    vec![
      // AchievementModel {
      //   title: "10 Day Streak".to_string(),
      //   description: "Completed tasks for 10 consecutive days".to_string(),
      //   icon: "local_fire_department".to_string(),
      //   color: "#F59E0B".to_string(),
      //   date: "2 days ago".to_string(),
      // },
      // AchievementModel {
      //   title: "Early Bird".to_string(),
      //   description: "Completed 5 tasks before 9 AM".to_string(),
      //   icon: "wb_sunny".to_string(),
      //   color: "#3B82F6".to_string(),
      //   date: "1 week ago".to_string(),
      // },
      // AchievementModel {
      //   title: "Task Master".to_string(),
      //   description: format!("Completed {} tasks total", tasks.len()),
      //   icon: "emoji_events".to_string(),
      //   color: "#10B981".to_string(),
      //   date: "2 weeks ago".to_string(),
      // },
    ]
  }

  #[allow(non_snake_case)]
  fn computeDetailedMetrics(
    &self,
    dailyActivities: &Vec<serde_json::Value>,
    previousDailyActivities: &Vec<serde_json::Value>,
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
