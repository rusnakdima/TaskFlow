use crate::entities::daily_activity_entity::DailyActivityModel;

pub struct ActivityFormatter;

impl ActivityFormatter {
  pub fn calculate_total_activity(activity: &DailyActivityModel) -> i32 {
    activity.todos_created
      + activity.todos_updated
      + activity.todos_deleted
      + activity.tasks_created
      + activity.tasks_updated
      + activity.tasks_completed
      + activity.tasks_deleted
      + activity.subtasks_created
      + activity.subtasks_updated
      + activity.subtasks_completed
      + activity.subtasks_deleted
  }

  pub fn calculate_productivity_score(activity: &DailyActivityModel) -> i32 {
    if activity.total_tasks > 0 {
      ((activity.completed_tasks as f32 / activity.total_tasks as f32) * 100.0) as i32
    } else {
      0
    }
  }
}
