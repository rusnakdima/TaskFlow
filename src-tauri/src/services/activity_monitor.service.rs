/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;
use crate::services::entity_resolution_service::EntityResolutionService;

#[derive(Clone)]
pub struct ActivityMonitorService {
  pub activity_log_helper: Arc<ActivityLogHelper>,
  pub entity_resolution: Arc<EntityResolutionService>,
}

impl ActivityMonitorService {
  pub fn new(
    activity_log_helper: Arc<ActivityLogHelper>,
    entity_resolution: Arc<EntityResolutionService>,
  ) -> Self {
    Self {
      activity_log_helper,
      entity_resolution,
    }
  }

  /// Log activity based on table and operation
  pub async fn log_action(
    &self,
    table: &str,
    operation: &str,
    data: &Value,
    original: Option<&Value>,
  ) {
    let source_data = original.unwrap_or(data);
    let user_id = match self
      .entity_resolution
      .get_user_id_for_entity(table, source_data)
      .await
    {
      Some(id) => id,
      None => return,
    };

    let activity_type = match (table, operation) {
      ("todos", "create") => "todo_created",
      ("todos", "update") => "todo_updated",
      ("todos", "delete") => "todo_deleted",
      ("tasks", "create") => "task_created",
      ("tasks", "delete") => "task_deleted",
      ("tasks", "update") => {
        let orig_status = original
          .and_then(|o| o.get("status"))
          .and_then(|v| v.as_str());
        let new_status = data.get("status").and_then(|v| v.as_str());
        if new_status == Some("completed") && orig_status != Some("completed") {
          "task_completed"
        } else {
          "task_updated"
        }
      }
      ("subtasks", "create") => "subtask_created",
      ("subtasks", "delete") => "subtask_deleted",
      ("subtasks", "update") => {
        let orig_status = original
          .and_then(|o| o.get("status"))
          .and_then(|v| v.as_str());
        let new_status = data.get("status").and_then(|v| v.as_str());
        if new_status == Some("completed") && orig_status != Some("completed") {
          "subtask_completed"
        } else {
          "subtask_updated"
        }
      }
      _ => "",
    };

    if !activity_type.is_empty() {
      let _ = self
        .activity_log_helper
        .log_activity(user_id, activity_type, 1)
        .await;
    }
  }
}
