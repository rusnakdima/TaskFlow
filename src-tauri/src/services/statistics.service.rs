/* sys lib */
use chrono::NaiveDate;
use serde_json::{json, Value};
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::json_provider::JsonProvider;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  statistics_model::StatisticsResponseModel,
  sync_metadata_model::SyncMetadata,
};

/* statistics modules */
use crate::services::statistics::{
  category_statistics::CategoryStatistics, chart_generator::ChartGenerator,
  date_calculator::DateCalculator, task_analytics::TaskAnalytics,
};

#[derive(Clone)]
pub struct StatisticsService {
  pub jsonProvider: JsonProvider,
  pub activityLogHelper: Arc<ActivityLogHelper>,
}

impl StatisticsService {
  pub fn new(jsonProvider: JsonProvider, activityLogHelper: Arc<ActivityLogHelper>) -> Self {
    Self {
      jsonProvider,
      activityLogHelper,
    }
  }

  pub async fn getStatistics(
    &self,
    userId: String,
    timeRange: String,
    _syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let (startDate, endDate) = DateCalculator::calculateDateRange(&timeRange);
    let startDateNaive = startDate.date_naive();
    let endDateNaive = endDate.date_naive();

    let previousStartDate = startDate - (endDate - startDate);
    let previousEndDate = startDate;
    let prevStartNaive = previousStartDate.date_naive();
    let prevEndNaive = previousEndDate.date_naive();

    // Fetch data
    let dailyActivities = self
      .getDailyActivitiesFiltered(&userId, &startDateNaive, &endDateNaive)
      .await;
    let previousDailyActivities = self
      .getDailyActivitiesFiltered(&userId, &prevStartNaive, &prevEndNaive)
      .await;

    let tasks = self
      .jsonProvider
      .jsonCrud
      .getAll("tasks", Some(json!({"userId": userId})))
      .await
      .unwrap_or_default();

    let currentTasks = DateCalculator::filterByDateRange(&tasks, &startDate, &endDate, "createdAt");
    let previousTasks =
      DateCalculator::filterByDateRange(&tasks, &previousStartDate, &previousEndDate, "createdAt");

    let categories = self
      .jsonProvider
      .jsonCrud
      .getAll("categories", Some(json!({"userId": userId})))
      .await
      .unwrap_or_default();

    let todos = self
      .jsonProvider
      .jsonCrud
      .getAll("todos", Some(json!({"userId": userId})))
      .await
      .unwrap_or_default();

    // Compute metrics
    let statistics = TaskAnalytics::computeStatistics(
      &dailyActivities,
      &previousDailyActivities,
      &currentTasks,
      &previousTasks,
    );

    let categoriesWithCounts = CategoryStatistics::calculateCategoryTasks(
      &categories,
      &todos,
      &currentTasks,
      &startDateNaive,
      &endDateNaive,
    );

    let chartData = ChartGenerator::computeChartData(
      &currentTasks,
      &categoriesWithCounts,
      &dailyActivities,
      &startDateNaive,
      &endDateNaive,
    );

    let detailedMetrics =
      TaskAnalytics::computeDetailedMetrics(&dailyActivities, &previousDailyActivities);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Statistics retrieved successfully".to_string(),
      data: DataValue::Object(
        serde_json::to_value(StatisticsResponseModel {
          statistics,
          chartData,
          detailedMetrics,
        })
        .unwrap(),
      ),
    })
  }

  async fn getDailyActivitiesFiltered(
    &self,
    userId: &str,
    startDate: &NaiveDate,
    endDate: &NaiveDate,
  ) -> Vec<Value> {
    let activities = self
      .activityLogHelper
      .getAll(json!({"userId": userId.to_string()}))
      .await;

    let docs = match activities {
      Ok(resp) => {
        if let DataValue::Array(arr) = resp.data {
          arr
        } else {
          Vec::new()
        }
      }
      Err(_) => Vec::new(),
    };

    docs
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
}
