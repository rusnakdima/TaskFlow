use nosql_orm::events::EntityEventListener;
use nosql_orm::error::OrmResult;
use serde_json::Value;
use std::sync::Arc;

pub trait ActivityTracker: Send + Sync {
  fn log(&self, operation: &str, entity: &Value);
}

pub struct TaskFlowEntityListener {
  activity_service: Arc<dyn ActivityTracker>,
}

impl TaskFlowEntityListener {
  pub fn new(activity_service: Arc<dyn ActivityTracker>) -> Self {
    Self { activity_service }
  }
}

#[async_trait::async_trait]
impl EntityEventListener<Value> for TaskFlowEntityListener {
  async fn before_insert(&self, entity: &Value) -> OrmResult<()> {
    tracing::info!("[EVENT] Before insert: {:?}", entity);
    Ok(())
  }

  async fn after_insert(&self, entity: &Value) -> OrmResult<()> {
    if let Some(id) = entity.get("id").and_then(|v| v.as_str()) {
      tracing::info!("[EVENT] Entity inserted with id: {}", id);
    }
    self.activity_service.log("insert", entity);
    Ok(())
  }

  async fn before_update(&self, entity: &Value) -> OrmResult<()> {
    tracing::info!("[EVENT] Before update: {:?}", entity);
    Ok(())
  }

  async fn after_update(&self, entity: &Value) -> OrmResult<()> {
    tracing::info!("[EVENT] Entity updated: {:?}", entity);
    self.activity_service.log("update", entity);
    Ok(())
  }

  async fn before_delete(&self, entity: &Value) -> OrmResult<()> {
    tracing::info!("[EVENT] Before delete: {:?}", entity);
    Ok(())
  }

  async fn after_delete(&self, entity: &Value) -> OrmResult<()> {
    tracing::info!("[EVENT] Entity deleted: {:?}", entity);
    self.activity_service.log("delete", entity);
    Ok(())
  }
}
