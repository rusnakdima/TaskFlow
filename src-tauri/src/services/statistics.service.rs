/* sys lib */
use chrono::NaiveDate;
use serde_json::{json, Value};
use std::sync::Arc;

/* providers */
use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  statistics_entity::StatisticsResponseModel,
  sync_metadata_entity::SyncMetadata,
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

    // Fetch data using nosql_orm with filters
    let userIdFilter = Filter::Eq("user_id".to_string(), json!(userId));
    let startDateFilter = Filter::Gte("created_at".to_string(), json!(startDate.to_rfc3339()));
    let endDateFilter = Filter::Lte("created_at".to_string(), json!(endDate.to_rfc3339()));
    let prevStartDateFilter = Filter::Gte(
      "created_at".to_string(),
      json!(previousStartDate.to_rfc3339()),
    );
    let prevEndDateFilter = Filter::Lt("created_at".to_string(), json!(startDate.to_rfc3339()));

    let dailyActivities = self
      .getDailyActivitiesFiltered(&userId, &startDateNaive, &endDateNaive)
      .await;
    let previousDailyActivities = self
      .getDailyActivitiesFiltered(&userId, &prevStartNaive, &prevEndNaive)
      .await;

    let currentTasks: Vec<Value> = self
      .jsonProvider
      .find_many(
        "tasks",
        Some(&Filter::And(vec![
          userIdFilter.clone(),
          startDateFilter,
          endDateFilter,
        ])),
        None,
        None,
        None,
        true,
      )
      .await
      .unwrap_or_default();

    let previousTasks: Vec<Value> = self
      .jsonProvider
      .find_many(
        "tasks",
        Some(&Filter::And(vec![
          userIdFilter.clone(),
          prevStartDateFilter,
          prevEndDateFilter,
        ])),
        None,
        None,
        None,
        true,
      )
      .await
      .unwrap_or_default();

    let categories: Vec<Value> = self
      .jsonProvider
      .find_many("categories", Some(&userIdFilter), None, None, None, true)
      .await
      .unwrap_or_default();

    let todos: Vec<Value> = self
      .jsonProvider
      .find_many("todos", Some(&userIdFilter), None, None, None, true)
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
      .getAll(json!({"user_id": userId.to_string()}))
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

    // Filter by date range and deduplicate by date (keep latest)
    let mut dateMap: std::collections::HashMap<String, Value> = std::collections::HashMap::new();

    for activity in docs {
      if let Some(dateStr) = activity.get("date").and_then(|v| v.as_str()) {
        if let Ok(date) = NaiveDate::parse_from_str(dateStr, "%Y-%m-%d") {
          if date >= *startDate && date <= *endDate {
            // Keep the latest record for each date (based on updated_at)
            let should_insert = match dateMap.get(dateStr) {
              Some(existing) => {
                let existing_updated = existing
                  .get("updated_at")
                  .and_then(|v| v.as_str())
                  .unwrap_or("");
                let new_updated = activity
                  .get("updated_at")
                  .and_then(|v| v.as_str())
                  .unwrap_or("");
                new_updated > existing_updated
              }
              None => true,
            };

            if should_insert {
              dateMap.insert(dateStr.to_string(), activity);
            }
          }
        }
      }
    }

    // Convert map to vector
    dateMap.into_values().collect()
  }
}
