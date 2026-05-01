/* sys lib */
use chrono::NaiveDate;
use serde_json::{json, Value};
use std::sync::Arc;

/* providers */
use nosql_orm::prelude::{DatabaseProvider, Filter};
use nosql_orm::providers::JsonProvider;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  statistics_entity::StatisticsResponseModel,
};

/* statistics modules */
use crate::services::statistics::{
  category_statistics::CategoryStatistics, chart_generator::ChartGenerator,
  date_calculator::DateCalculator, task_analytics::TaskAnalytics,
};

#[derive(Clone)]
pub struct StatisticsService {
  pub json_provider: JsonProvider,
  pub activity_log_helper: Arc<ActivityLogHelper>,
}

impl StatisticsService {
  pub fn new(json_provider: JsonProvider, activity_log_helper: Arc<ActivityLogHelper>) -> Self {
    Self {
      json_provider,
      activity_log_helper,
    }
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

    // Fetch data using nosql_orm with filters
    let user_id_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let start_date_filter = Filter::Gte("created_at".to_string(), json!(start_date.to_rfc3339()));
    let end_date_filter = Filter::Lte("created_at".to_string(), json!(end_date.to_rfc3339()));
    let prev_start_date_filter = Filter::Gte(
      "created_at".to_string(),
      json!(previous_start_date.to_rfc3339()),
    );
    let prev_end_date_filter = Filter::Lt("created_at".to_string(), json!(start_date.to_rfc3339()));

    let daily_activities = self
      .get_daily_activities_filtered(&user_id, &start_date_naive, &end_date_naive)
      .await;
    let previous_daily_activities = self
      .get_daily_activities_filtered(&user_id, &prev_start_naive, &prev_end_naive)
      .await;

    let current_tasks: Vec<Value> = self
      .json_provider
      .find_many(
        "tasks",
        Some(&Filter::And(vec![
          user_id_filter.clone(),
          start_date_filter,
          end_date_filter,
        ])),
        None,
        None,
        None,
        true,
      )
      .await
      .unwrap_or_default();

    let previous_tasks: Vec<Value> = self
      .json_provider
      .find_many(
        "tasks",
        Some(&Filter::And(vec![
          user_id_filter.clone(),
          prev_start_date_filter,
          prev_end_date_filter,
        ])),
        None,
        None,
        None,
        true,
      )
      .await
      .unwrap_or_default();

    let categories: Vec<Value> = self
      .json_provider
      .find_many("categories", Some(&user_id_filter), None, None, None, true)
      .await
      .unwrap_or_default();

    let todos: Vec<Value> = self
      .json_provider
      .find_many("todos", Some(&user_id_filter), None, None, None, true)
      .await
      .unwrap_or_default();

    // Compute metrics
    let statistics = TaskAnalytics::compute_statistics(
      &daily_activities,
      &previous_daily_activities,
      &current_tasks,
      &previous_tasks,
    );

    let categories_with_counts = CategoryStatistics::calculate_category_tasks(
      &categories,
      &todos,
      &current_tasks,
      &start_date_naive,
      &end_date_naive,
    );

    let chart_data = ChartGenerator::compute_chart_data(
      &current_tasks,
      &categories_with_counts,
      &daily_activities,
      &start_date_naive,
      &end_date_naive,
    );

    let detailed_metrics =
      TaskAnalytics::compute_detailed_metrics(&daily_activities, &previous_daily_activities);

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Statistics retrieved successfully".to_string(),
      data: DataValue::Object(
        serde_json::to_value(StatisticsResponseModel {
          statistics,
          chart_data,
          detailed_metrics,
        })
        .unwrap(),
      ),
    })
  }

  async fn get_daily_activities_filtered(
    &self,
    user_id: &str,
    start_date: &NaiveDate,
    end_date: &NaiveDate,
  ) -> Vec<Value> {
    let pipeline = vec![
      serde_json::json!({
        "$match": {
          "user_id": user_id,
          "date": {
            "$gte": start_date.format("%Y-%m-%d").to_string(),
            "$lte": end_date.format("%Y-%m-%d").to_string()
          }
        }
      }),
      serde_json::json!({
        "$sort": { "updated_at": -1 }
      }),
      serde_json::json!({
        "$group": {
          "_id": "$date",
          "doc": { "$first": "$$ROOT" }
        }
      }),
      serde_json::json!({
        "$replaceRoot": { "newRoot": "$doc" }
      }),
    ];

    let agg_result = self
      .json_provider
      .aggregate("daily_activities", pipeline)
      .await;

    if let Ok(results) = agg_result {
      return results;
    }

    let filter = json!({
      "$and": [
        {"user_id": user_id},
        {"date": {"$gte": start_date.format("%Y-%m-%d").to_string()}},
        {"date": {"$lte": end_date.format("%Y-%m-%d").to_string()}}
      ]
    });

    let activities = self.activity_log_helper.get_all(filter).await;

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
