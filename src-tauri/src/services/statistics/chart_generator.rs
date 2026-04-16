use crate::entities::statistics_entity::{
  CategoryItem, ChartDataModel, CompletionTrendItem, DailyActivityItem,
};
use chrono::{DateTime, Datelike, NaiveDate, Weekday};
use serde_json::Value;
use std::collections::HashMap;

pub struct ChartGenerator;

impl ChartGenerator {
  pub fn computeChartData(
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
        let totalTasks = category
          .get("taskCount")
          .and_then(|v| v.as_i64())
          .unwrap_or(0) as i32;

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
}
