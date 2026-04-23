/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StatisticsModel {
  pub total_tasks: i32,
  pub completion_rate: i32,
  pub average_task_time: i32,
  pub productivity_score: i32,
  pub previous_total_tasks: i32,
  pub previous_completion_rate: i32,
  pub previous_average_time: i32,
  pub previous_productivity_score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CompletionTrendItem {
  pub label: String,
  pub value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DailyActivityItem {
  pub day_name: String,
  pub activity: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CategoryItem {
  pub name: String,
  pub count: i32,
  pub percentage: i32,
  pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ChartDataModel {
  pub completion_trend: Vec<CompletionTrendItem>,
  pub categories: Vec<CategoryItem>,
  pub daily_activity: Vec<DailyActivityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DetailedMetricModel {
  pub name: String,
  pub current: String,
  pub previous: String,
  pub change: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StatisticsResponseModel {
  pub statistics: StatisticsModel,
  pub chart_data: ChartDataModel,
  pub detailed_metrics: Vec<DetailedMetricModel>,
}
