/* sys lib */
use std::sync::Arc;

/* providers */
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;

/* helpers */
use crate::helpers::response_helper::errResponseFormatted;

/* models */
use crate::entities::response_entity::ResponseModel;

use super::cascade_ids::CascadeIds;
use super::json_cascade::JsonCascadeHandler;
use super::mongo_cascade::MongoCascadeHandler;

/// CascadeService - Orchestrates cascade operations for both JSON and MongoDB
#[derive(Clone)]
pub struct CascadeService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub jsonHandler: Option<JsonCascadeHandler>,
  pub mongoHandler: Option<MongoCascadeHandler>,
}

impl CascadeService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongoProvider>>) -> Self {
    let jsonHandler = Some(JsonCascadeHandler::new(jsonProvider.clone()));
    let mongoHandler = mongodbProvider
      .as_ref()
      .map(|p| MongoCascadeHandler::new(p.clone()));

    Self {
      jsonProvider,
      mongodbProvider,
      jsonHandler,
      mongoHandler,
    }
  }

  /// Handle JSON Cascade (delete/restore)
  pub async fn handleJsonCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if let Some(ref handler) = self.jsonHandler {
      return handler.handleCascade(table, id, isRestore).await;
    }
    Err(errResponseFormatted("JSON handler not available", ""))
  }

  /// Handle MongoDB Cascade (delete/restore)
  pub async fn handleMongoCascade(
    &self,
    table: &str,
    id: &str,
    isRestore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if let Some(ref handler) = self.mongoHandler {
      return handler.handleCascade(table, id, isRestore).await;
    }
    Err(errResponseFormatted("MongoDB not available", ""))
  }
}
