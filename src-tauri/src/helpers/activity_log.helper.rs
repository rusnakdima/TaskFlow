/* sys lib */
use serde_json::Value;

/* helpers */
use crate::helpers::activity::formatter::ActivityFormatter;
use crate::helpers::activity::storage::ActivityStorage;

/* providers */
use nosql_orm::providers::JsonProvider;

/* models */
use crate::entities::response_entity::ResponseModel;

#[derive(Clone)]
pub struct ActivityLogHelper {
  pub storage: ActivityStorage,
}

impl ActivityLogHelper {
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      storage: ActivityStorage::new(jsonProvider),
    }
  }

  pub async fn getAll(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    self.storage.getAll(filter).await
  }

  pub async fn logActivity(
    &self,
    userId: String,
    activityType: &str,
    count: i32,
  ) -> Result<(), ResponseModel> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let mut activity = self.storage.getOrCreateDailyActivity(userId, today).await?;

    match activityType {
      "todo_created" => activity.todos_created += count,
      "todo_updated" => activity.todos_updated += count,
      "todo_deleted" => activity.todos_deleted += count,
      "task_created" => {
        activity.tasks_created += count;
        activity.total_tasks += count;
      }
      "task_updated" => activity.tasks_updated += count,
      "task_completed" => {
        activity.tasks_completed += count;
        activity.completed_tasks += count;
      }
      "task_deleted" => {
        activity.tasks_deleted += count;
        activity.total_tasks -= count;
        if activity.total_tasks < 0 {
          activity.total_tasks = 0;
        }
      }
      "subtask_created" => activity.subtasks_created += count,
      "subtask_updated" => activity.subtasks_updated += count,
      "subtask_completed" => activity.subtasks_completed += count,
      "subtask_deleted" => activity.subtasks_deleted += count,
      _ => {}
    }

    activity.total_activity = ActivityFormatter::calculateTotalActivity(&activity);
    activity.productivity_score = ActivityFormatter::calculateProductivityScore(&activity);

    self.storage.updateDailyActivity(activity).await
  }
}
