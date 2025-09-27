/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct StatisticsModel {
  pub totalTasks: i32,
  pub completionRate: i32,
  pub averageTaskTime: i32,
  pub productivityScore: i32,
  pub previousTotalTasks: i32,
  pub previousCompletionRate: i32,
  pub previousAverageTime: i32,
  pub previousProductivityScore: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CompletionTrendItem {
  pub label: String,
  pub value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DailyActivityItem {
  pub dayName: String,
  pub activity: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CategoryItem {
  pub name: String,
  pub count: i32,
  pub percentage: i32,
  pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ChartDataModel {
  pub completionTrend: Vec<CompletionTrendItem>,
  pub categories: Vec<CategoryItem>,
  pub dailyActivity: Vec<DailyActivityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct AchievementModel {
  pub title: String,
  pub description: String,
  pub icon: String,
  pub color: String,
  pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DetailedMetricModel {
  pub name: String,
  pub current: String,
  pub previous: String,
  pub change: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct StatisticsResponseModel {
  pub statistics: StatisticsModel,
  pub chartData: ChartDataModel,
  pub achievements: Vec<AchievementModel>,
  pub detailedMetrics: Vec<DetailedMetricModel>,
}
