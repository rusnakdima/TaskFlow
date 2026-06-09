/* sys lib */
use chrono::NaiveDate;
use serde_json::{json, Value};

/* providers */
use nosql_orm::prelude::{DatabaseProvider, Filter};
use nosql_orm::providers::JsonProvider;

/* models */
use crate::entities::{
  response_entity::{ResponseModel, ResponseStatus},
  statistics_entity::StatisticsResponseModel,
};

/* helpers */
use crate::helpers::response_helper::err_response;

/* statistics modules */
use crate::services::statistics::{
  category_statistics::CategoryStatistics, chart_generator::ChartGenerator,
  date_calculator::DateCalculator, task_analytics::TaskAnalytics,
};

#[derive(Clone)]
pub struct StatisticsService {
  pub json_provider: JsonProvider,
}

impl StatisticsService {
  pub fn new(json_provider: JsonProvider) -> Self {
    Self { json_provider }
  }

  pub async fn get_statistics(
    &self,
    user_id: String,
    time_range: String,
    _visibility: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let (start_date, end_date) = DateCalculator::calculate_date_range(&time_range);
    let start_date_naive = start_date.date_naive();
    let end_date_naive = end_date.date_naive();

    let previous_start_date = start_date - (end_date - start_date);
    let previous_end_date = start_date;
    let prev_start_naive = previous_start_date.date_naive();
    let prev_end_naive = previous_end_date.date_naive();

    let daily_activities = self
      .get_daily_activities_filtered(&user_id, &start_date_naive, &end_date_naive)
      .await;

    let previous_daily_activities = self
      .get_daily_activities_filtered(&user_id, &prev_start_naive, &prev_end_naive)
      .await;

    let todos_filter = Filter::from_json(&json!({ "user_id": user_id }))
      .map_err(|e| err_response(&format!("Filter error: {}", e)))?;
    let todos: Vec<Value> = self
      .json_provider
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
      .unwrap_or_default();

    let todo_ids: Vec<String> = todos
      .iter()
      .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
      .collect();

    let start_str = start_date.to_rfc3339();
    let end_str = end_date.to_rfc3339();
    let prev_start_str = previous_start_date.to_rfc3339();
    let _prev_end_str = previous_end_date.to_rfc3339();

    let all_tasks: Vec<Value> = self
      .json_provider
      .find_many("tasks", None, None, None, None, true)
      .await
      .unwrap_or_default();

    let current_tasks: Vec<Value> = all_tasks
      .iter()
      .filter(|task| {
        let task_todo_id = task.get("todo_id").and_then(|v| v.as_str());
        if !todo_ids.iter().any(|id| id == task_todo_id.unwrap_or("")) {
          return false;
        }

        let created_at = task.get("created_at").and_then(|v| v.as_str());
        let updated_at = task.get("updated_at").and_then(|v| v.as_str());

        let in_created_range = created_at
          .map(|s| s >= start_str.as_str() && s <= end_str.as_str())
          .unwrap_or(false);
        let in_updated_range = updated_at
          .map(|s| s >= start_str.as_str() && s <= end_str.as_str())
          .unwrap_or(false);

        in_created_range || in_updated_range
      })
      .cloned()
      .collect();

    let previous_tasks: Vec<Value> = all_tasks
      .iter()
      .filter(|task| {
        let task_todo_id = task.get("todo_id").and_then(|v| v.as_str());
        if !todo_ids.iter().any(|id| id == task_todo_id.unwrap_or("")) {
          return false;
        }

        let created_at = task.get("created_at").and_then(|v| v.as_str());
        let updated_at = task.get("updated_at").and_then(|v| v.as_str());

        let in_created_range = created_at
          .map(|s| s >= prev_start_str.as_str() && s < end_str.as_str())
          .unwrap_or(false);
        let in_updated_range = updated_at
          .map(|s| s >= prev_start_str.as_str() && s < end_str.as_str())
          .unwrap_or(false);

        in_created_range || in_updated_range
      })
      .cloned()
      .collect();

    let user_id_filter = Filter::from_json(&json!({ "user_id": user_id }))
      .map_err(|e| err_response(&format!("Filter error: {}", e)))?;
    let _categories: Vec<Value> = self
      .json_provider
      .find_many("categories", Some(&user_id_filter), None, None, None, true)
      .await
      .unwrap_or_default();
    let categories: Vec<Value> = self
      .json_provider
      .find_many("categories", Some(&user_id_filter), None, None, None, true)
      .await
      .unwrap_or_default();

    let statistics = TaskAnalytics::compute_statistics(
      &daily_activities,
      &previous_daily_activities,
      &current_tasks,
      &previous_tasks,
    )
    .await;

    let categories_with_counts = CategoryStatistics::calculate_category_tasks(
      &categories,
      &todos,
      &current_tasks,
      &start_date_naive,
      &end_date_naive,
    )
    .await;

    let chart_data = ChartGenerator::compute_chart_data(
      &current_tasks,
      &categories_with_counts,
      &todos,
      &daily_activities,
      &start_date_naive,
      &end_date_naive,
    )
    .await;

    let detailed_metrics =
      TaskAnalytics::compute_detailed_metrics(&daily_activities, &previous_daily_activities).await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Statistics retrieved successfully".to_string(),
      data: serde_json::to_value(StatisticsResponseModel {
        statistics,
        chart_data,
        detailed_metrics,
      })
      .unwrap(),
    })
  }

  async fn get_daily_activities_filtered(
    &self,
    user_id: &str,
    start_date: &NaiveDate,
    end_date: &NaiveDate,
  ) -> Vec<Value> {
    let start_str = start_date.format("%Y-%m-%d").to_string();
    let end_str = end_date.format("%Y-%m-%d").to_string();

    let user_filter = Filter::from_json(&serde_json::json!({
      "user_id": user_id
    }))
    .unwrap();

    let all_user_docs: Vec<Value> = self
      .json_provider
      .find_many(
        "daily_activities",
        Some(&user_filter),
        None,
        None,
        None,
        true,
      )
      .await
      .unwrap_or_default();

    let filtered: Vec<Value> = all_user_docs
      .into_iter()
      .filter(|doc| {
        let date_str = doc.get("date").and_then(|v| v.as_str()).unwrap_or("");
        date_str >= start_str.as_str() && date_str <= end_str.as_str()
      })
      .collect();

    Self::deduplicate_by_date(filtered)
  }

  fn deduplicate_by_date(docs: Vec<Value>) -> Vec<Value> {
    let mut date_map: std::collections::HashMap<String, Value> = std::collections::HashMap::new();

    for activity in docs {
      if let Some(date_str) = activity.get("date").and_then(|v| v.as_str()) {
        let should_insert = match date_map.get(date_str) {
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
          date_map.insert(date_str.to_string(), activity);
        }
      }
    }

    date_map.into_values().collect()
  }
}
