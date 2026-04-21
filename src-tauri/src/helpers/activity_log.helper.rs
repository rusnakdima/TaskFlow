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
      "todo_created" => activity.todosCreated += count,
      "todo_updated" => activity.todosUpdated += count,
      "todo_deleted" => activity.todosDeleted += count,
      "task_created" => {
        activity.tasksCreated += count;
        activity.totalTasks += count;
      }
      "task_updated" => activity.tasksUpdated += count,
      "task_completed" => {
        activity.tasksCompleted += count;
        activity.completedTasks += count;
      }
      "task_deleted" => {
        activity.tasksDeleted += count;
        activity.totalTasks -= count;
        if activity.totalTasks < 0 {
          activity.totalTasks = 0;
        }
      }
      "subtask_created" => activity.subtasksCreated += count,
      "subtask_updated" => activity.subtasksUpdated += count,
      "subtask_completed" => activity.subtasksCompleted += count,
      "subtask_deleted" => activity.subtasksDeleted += count,
      _ => {}
    }

    activity.totalActivity = ActivityFormatter::calculateTotalActivity(&activity);
    activity.productivityScore = ActivityFormatter::calculateProductivityScore(&activity);

    self.storage.updateDailyActivity(activity).await
  }
}
