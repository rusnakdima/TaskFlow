/* sys lib */
use std::sync::Arc;

/* providers */
use nosql_orm::providers::MongoProvider;

/* models */
use crate::entities::response_entity::ResponseModel;

use super::cascade_ids::CascadeIds;
use super::cascade_provider::CascadeProvider;

/// MongoCascadeHandler - Handles BFS cascade ID collection for MongoDB provider
#[derive(Clone)]
pub struct MongoCascadeHandler {
  mongodbProvider: Arc<MongoProvider>,
}

impl MongoCascadeHandler {
  pub fn new(mongodbProvider: Arc<MongoProvider>) -> Self {
    Self { mongodbProvider }
  }
}

impl CascadeProvider for MongoCascadeHandler {
  async fn deleteWithCascade(&self, table: &str, id: &str) -> Result<CascadeIds, ResponseModel> {
    self.collectCascadeIds(table, id).await
  }

  async fn archiveWithCascade(
    &self,
    table: &str,
    id: &str,
    _isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    self.collectCascadeIds(table, id).await
  }
}

impl MongoCascadeHandler {
  pub async fn collectCascadeIds(
    &self,
    table: &str,
    id: &str,
  ) -> Result<CascadeIds, ResponseModel> {
    let mut cascadeIds = CascadeIds::default();

    if table == "todos" {
      cascadeIds.addTaskId(id.to_string());
    } else if table == "tasks" {
      cascadeIds.addTaskId(id.to_string());
      cascadeIds.addSubtaskId(id.to_string());
    } else if table == "subtasks" {
      cascadeIds.addSubtaskId(id.to_string());
    }

    Ok(cascadeIds)
  }

  pub async fn handleCascade(
    &self,
    table: &str,
    id: &str,
    _isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    let cascadeIds = self.collectCascadeIds(table, id).await?;
    Ok(cascadeIds)
  }
}
