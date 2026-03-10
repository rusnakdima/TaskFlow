/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* helpers */
use crate::helpers::activity_log::ActivityLogHelper;
use crate::services::entity_resolution_service::EntityResolutionService;

#[derive(Clone)]
pub struct ActivityMonitorService {
  pub activityLogHelper: Arc<ActivityLogHelper>,
  pub entityResolution: Arc<EntityResolutionService>,
}

impl ActivityMonitorService {
  pub fn new(
    activityLogHelper: Arc<ActivityLogHelper>,
    entityResolution: Arc<EntityResolutionService>,
  ) -> Self {
    Self {
      activityLogHelper,
      entityResolution,
    }
  }

  /// Log activity based on table and operation
  pub async fn logAction(
    &self,
    table: &str,
    operation: &str,
    data: &Value,
    original: Option<&Value>,
  ) {
    let sourceData = original.unwrap_or(data);
    let userId = match self
      .entityResolution
      .getUserIdForEntity(table, sourceData)
      .await
    {
      Some(id) => id,
      None => return,
    };

    let activityType = match (table, operation) {
      ("todos", "create") => "todo_created",
      ("todos", "update") => "todo_updated",
      ("todos", "delete") => "todo_deleted",
      ("tasks", "create") => "task_created",
      ("tasks", "delete") => "task_deleted",
      ("tasks", "update") => {
        let origStatus = original
          .and_then(|o| o.get("status"))
          .and_then(|v| v.as_str());
        let newStatus = data.get("status").and_then(|v| v.as_str());
        if newStatus == Some("completed") && origStatus != Some("completed") {
          "task_completed"
        } else {
          "task_updated"
        }
      }
      ("subtasks", "create") => "subtask_created",
      ("subtasks", "delete") => "subtask_deleted",
      ("subtasks", "update") => {
        let origStatus = original
          .and_then(|o| o.get("status"))
          .and_then(|v| v.as_str());
        let newStatus = data.get("status").and_then(|v| v.as_str());
        if newStatus == Some("completed") && origStatus != Some("completed") {
          "subtask_completed"
        } else {
          "subtask_updated"
        }
      }
      _ => "",
    };

    if !activityType.is_empty() {
      let _ = self
        .activityLogHelper
        .logActivity(userId, activityType, 1)
        .await;
    }
  }
}
