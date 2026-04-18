/* providers */
use nosql_orm::providers::JsonProvider;

/* entities */
use crate::entities::response_entity::ResponseModel;

use super::cascade_ids::CascadeIds;
use super::cascade_provider::CascadeProvider;

/// JsonCascadeHandler - Handles BFS cascade ID collection for JSON provider
#[derive(Clone)]
pub struct JsonCascadeHandler {
  jsonProvider: JsonProvider,
}

impl JsonCascadeHandler {
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self { jsonProvider }
  }
}

impl CascadeProvider for JsonCascadeHandler {
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

impl JsonCascadeHandler {
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
