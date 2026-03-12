/* sys lib */
use std::sync::Arc;

/* providers */
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongodbProvider;

/* helpers */
use crate::helpers::response_helper::errResponseFormatted;

/* models */
use crate::models::response_model::ResponseModel;

use super::cascade_ids::CascadeIds;
use super::json_cascade::JsonCascadeHandler;
use super::mongo_cascade::MongoCascadeHandler;

/// CascadeService - Orchestrates cascade operations for both JSON and MongoDB
#[derive(Clone)]
pub struct CascadeService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  jsonHandler: Option<JsonCascadeHandler>,
  mongoHandler: Option<MongoCascadeHandler>,
}

impl CascadeService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
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
    is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if let Some(ref handler) = self.jsonHandler {
      return handler.handleCascade(table, id, is_restore).await;
    }
    Err(errResponseFormatted("JSON handler not available", ""))
  }

  /// Handle MongoDB Cascade (delete/restore)
  pub async fn handleMongoCascade(
    &self,
    table: &str,
    id: &str,
    is_restore: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if let Some(ref handler) = self.mongoHandler {
      return handler.handleCascade(table, id, is_restore).await;
    }
    Err(errResponseFormatted("MongoDB not available", ""))
  }

  /// Handle cascade based on provider type
  pub async fn handleCascade(
    &self,
    table: &str,
    id: &str,
    is_restore: bool,
    use_mongo: bool,
  ) -> Result<CascadeIds, ResponseModel> {
    if use_mongo {
      self.handleMongoCascade(table, id, is_restore).await
    } else {
      self.handleJsonCascade(table, id, is_restore).await
    }
  }
}
