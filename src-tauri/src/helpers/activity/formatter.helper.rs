use crate::entities::daily_activity_entity::DailyActivityModel;

pub struct ActivityFormatter;

impl ActivityFormatter {
  pub fn calculateTotalActivity(activity: &DailyActivityModel) -> i32 {
    activity.todosCreated
      + activity.todosUpdated
      + activity.todosDeleted
      + activity.tasksCreated
      + activity.tasksUpdated
      + activity.tasksCompleted
      + activity.tasksDeleted
      + activity.subtasksCreated
      + activity.subtasksUpdated
      + activity.subtasksCompleted
      + activity.subtasksDeleted
  }

  pub fn calculateProductivityScore(activity: &DailyActivityModel) -> i32 {
    if activity.totalTasks > 0 {
      ((activity.completedTasks as f32 / activity.totalTasks as f32) * 100.0) as i32
    } else {
      0
    }
  }
}