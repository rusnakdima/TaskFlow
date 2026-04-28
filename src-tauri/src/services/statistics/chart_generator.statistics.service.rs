use crate::entities::statistics_entity::{
  CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem,
};
use chrono::{DateTime, Datelike, NaiveDate, Weekday};
use serde_json::Value;
use std::collections::HashMap;

use nosql_orm::provider::DatabaseProvider;

pub struct ChartGenerator;

impl ChartGenerator {
  pub async fn compute_chart_data_with_aggregation<P: DatabaseProvider>(
    provider: &P,
    tasks: &[Value],
    categories: &[Value],
    daily_activities: &[Value],
    start_date: &NaiveDate,
    end_date: &NaiveDate,
    user_id: &str,
  ) -> Option<ChartDataModel> {
    let tasks_pipeline = vec![
      serde_json::json!({
        "$match": {
          "user_id": user_id,
          "updated_at": {
            "$gte": start_date.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "$lte": end_date.format("%Y-%m-%dT%H:%M:%S").to_string()
          }
        }
      }),
      serde_json::json!({
        "$group": {
          "_id": { "$dayOfWeek": "$updated_at" },
          "completed": {
            "$sum": {
              "$cond": [
                { "$in": ["$status", ["completed", "skipped"]] },
                1,
                0
              ]
            }
          },
          "total": { "$sum": 1 }
        }
      }),
      serde_json::json!({
        "$project": {
          "weekday": "$_id",
          "completed": 1,
          "total": 1,
          "percentage": {
            "$cond": [
              { "$gt": ["$total", 0] },
              { "$multiply": [{ "$divide": ["$completed", "$total"] }, 100] },
              0
            ]
          }
        }
      }),
    ];

    let activities_pipeline = vec![
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
        "$group": {
          "_id": { "$dayOfWeek": "$date" },
          "total_activity": { "$sum": "$total_activity" }
        }
      }),
    ];

    let tasks_result = provider.aggregate("tasks", tasks_pipeline).await;
    let activities_result = provider
      .aggregate("daily_activities", activities_pipeline)
      .await;

    let (completion_trend, daily_activity) = match (tasks_result, activities_result) {
      (Ok(tasks_agg), Ok(activities_agg)) => {
        let mut completion_by_weekday: HashMap<u32, (i32, i32)> = HashMap::new();
        for doc in tasks_agg {
          if let (Some(weekday), Some(total), Some(completed)) = (
            doc.get("weekday").and_then(|v| v.as_u64()),
            doc.get("total").and_then(|v| v.as_i64()),
            doc.get("completed").and_then(|v| v.as_i64()),
          ) {
            completion_by_weekday.insert(weekday as u32, (completed as i32, total as i32));
          }
        }

        let mut daily_activity_map: HashMap<u32, i32> = HashMap::new();
        for doc in activities_agg {
          if let (Some(weekday), Some(activity)) = (
            doc.get("_id").and_then(|v| v.as_u64()),
            doc.get("total_activity").and_then(|v| v.as_i64()),
          ) {
            daily_activity_map.insert(weekday as u32, activity as i32);
          }
        }

        let weekdays = [2, 3, 4, 5, 6, 7, 1];
        let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

        let completion_trend: Vec<CompletionTrendItem> = weekdays
          .iter()
          .map(|&wd| {
            let (completed, total) = completion_by_weekday.get(&wd).copied().unwrap_or((0, 0));
            let percentage = if total > 0 {
              (completed as f32 / total as f32 * 100.0) as i32
            } else {
              0
            };
            let idx = wd as usize - 1;
            CompletionTrendItem {
              label: match wd {
                1 => "Sunday".to_string(),
                2 => "Monday".to_string(),
                3 => "Tuesday".to_string(),
                4 => "Wednesday".to_string(),
                5 => "Thursday".to_string(),
                6 => "Friday".to_string(),
                7 => "Saturday".to_string(),
                _ => day_names[idx].to_string(),
              },
              value: percentage,
            }
          })
          .collect();

        let daily_activity: Vec<DailyActivityItem> = weekdays
          .iter()
          .map(|&wd| {
            let idx = wd as usize - 1;
            DailyActivityItem {
              day_name: day_names[idx].to_string(),
              activity: *daily_activity_map.get(&wd).unwrap_or(&0),
            }
          })
          .collect();

        (completion_trend, daily_activity)
      }
      _ => return None,
    };

    let category_colors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];
    let mut category_items = Vec::new();

    for (index, category) in categories.iter().enumerate() {
      if let Some(category_title) = category.get("title").and_then(|v| v.as_str()) {
        let total_tasks = category
          .get("task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

        let completed_tasks = category
          .get("completed_task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

        let percentage = if total_tasks > 0 {
          ((completed_tasks as f32 / total_tasks as f32) * 100.0) as i32
        } else {
          0
        };

        category_items.push(CategoryItem {
          name: category_title.to_string(),
          count: total_tasks,
          percentage,
          color: category_colors[index % category_colors.len()].to_string(),
        });
      }
    }

    Some(ChartDataModel {
      completion_trend,
      categories: category_items,
      daily_activity,
    })
  }

  pub fn compute_chart_data(
    tasks: &[Value],
    categories: &[Value],
    daily_activities: &[Value],
    _start_date: &NaiveDate,
    _end_date: &NaiveDate,
  ) -> ChartDataModel {
    let mut completion_by_weekday: HashMap<Weekday, (i32, i32)> = HashMap::new();

    for task in tasks {
      if let Some(updated_at) = task.get("updated_at").and_then(|v| v.as_str()) {
        if let Some(status) = task.get("status").and_then(|v| v.as_str()) {
          if let Ok(dt_updated) = DateTime::parse_from_rfc3339(updated_at) {
            let weekday = dt_updated.weekday();
            let entry = completion_by_weekday.entry(weekday).or_insert((0, 0));
            entry.1 += 1;
            if status == "completed" || status == "skipped" {
              entry.0 += 1;
            }
          }
        }
      }
    }

    let mut completion_trend = Vec::new();
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
      let day_name = match weekday {
        Weekday::Mon => "Monday",
        Weekday::Tue => "Tuesday",
        Weekday::Wed => "Wednesday",
        Weekday::Thu => "Thursday",
        Weekday::Fri => "Friday",
        Weekday::Sat => "Saturday",
        Weekday::Sun => "Sunday",
      }
      .to_string();

      let (completed, total) = completion_by_weekday
        .get(&weekday)
        .copied()
        .unwrap_or((0, 0));
      let percentage = if total > 0 {
        (completed as f32 / total as f32 * 100.0) as i32
      } else {
        0
      };

      completion_trend.push(CompletionTrendItem {
        label: day_name,
        value: percentage,
      });
    }

    let mut daily_activity_map: HashMap<String, i32> = HashMap::new();

    let day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for day in &day_names {
      daily_activity_map.insert(day.to_string(), 0);
    }

    for activity in daily_activities {
      if let Some(date_str) = activity.get("date").and_then(|v| v.as_str()) {
        if let Some(total_activity) = activity.get("total_activity").and_then(|v| v.as_i64()) {
          if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            let weekday = date.weekday();
            let day_index = match weekday {
              Weekday::Mon => 0,
              Weekday::Tue => 1,
              Weekday::Wed => 2,
              Weekday::Thu => 3,
              Weekday::Fri => 4,
              Weekday::Sat => 5,
              Weekday::Sun => 6,
            };
            let day_name = day_names[day_index];
            if let Some(count) = daily_activity_map.get_mut(day_name) {
              *count += total_activity as i32;
            }
          }
        }
      }
    }

    let daily_activity: Vec<DailyActivityItem> = day_names
      .iter()
      .map(|day| DailyActivityItem {
        day_name: day.to_string(),
        activity: *daily_activity_map.get(*day).unwrap_or(&0),
      })
      .collect();

    let category_colors = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4",
    ];
    let mut category_items = Vec::new();

    for (index, category) in categories.iter().enumerate() {
      if let Some(category_title) = category.get("title").and_then(|v| v.as_str()) {
        let total_tasks = category
          .get("task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

        let completed_tasks = category
          .get("completed_task_count")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

        let percentage = if total_tasks > 0 {
          ((completed_tasks as f32 / total_tasks as f32) * 100.0) as i32
        } else {
          0
        };

        category_items.push(CategoryItem {
          name: category_title.to_string(),
          count: total_tasks,
          percentage,
          color: category_colors[index % category_colors.len()].to_string(),
        });
      }
    }

    ChartDataModel {
      completion_trend,
      categories: category_items,
      daily_activity,
    }
  }
}
