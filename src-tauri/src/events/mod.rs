use nosql_orm::events::EntityEventListener;
use nosql_orm::error::OrmResult;
use serde_json::Value;
use std::sync::Arc;
use async_trait::async_trait;

/* services */
use crate::services::activity_monitor_service::ActivityMonitorService;

pub struct TaskFlowEntityListener {
  activity_service: Arc<ActivityMonitorService>,
}

impl TaskFlowEntityListener {
  pub fn new(activity_service: Arc<ActivityMonitorService>) -> Self {
    Self { activity_service }
  }
}

#[async_trait]
impl EntityEventListener<Value> for TaskFlowEntityListener {
  async fn before_insert(&self, _table: &str, _entity: &Value) -> OrmResult<()> {
    Ok(())
  }

  async fn after_insert(&self, table: &str, entity: &Value) -> OrmResult<()> {
    // Only log core entities
    if matches!(table, "todos" | "tasks" | "subtasks") {
      self.activity_service.log_action(table, "create", entity, None).await;
    }
    Ok(())
  }

  async fn before_update(&self, _table: &str, _entity: &Value) -> OrmResult<()> {
    Ok(())
  }

  async fn after_update(&self, table: &str, entity: &Value) -> OrmResult<()> {
    if matches!(table, "todos" | "tasks" | "subtasks") {
      self.activity_service.log_action(table, "update", entity, None).await;
    }
    Ok(())
  }

  async fn before_delete(&self, _table: &str, _entity: &Value) -> OrmResult<()> {
    Ok(())
  }

  async fn after_delete(&self, table: &str, entity: &Value) -> OrmResult<()> {
    if matches!(table, "todos" | "tasks" | "subtasks") {
      self.activity_service.log_action(table, "delete", entity, None).await;
    }
    Ok(())
  }
}
