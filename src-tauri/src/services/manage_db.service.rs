/* sys */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::response_helper::require_mongo;

/* services */
use crate::services::{
  admin_manager::AdminManager, cascade::CascadeService,
  entity_resolution_service::EntityResolutionService,
};

/// ManageDbService - Facade for database management operations
pub struct ManageDbService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub adminManager: Option<AdminManager>,
}

impl ManageDbService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    cascadeService: CascadeService,
    entityResolution: Arc<EntityResolutionService>,
  ) -> Self {
    let adminManager = mongodbProvider.clone().map(|mp| {
      AdminManager::new(
        jsonProvider.clone(),
        mp,
        cascadeService,
        entityResolution.clone(),
      )
    });

    Self {
      jsonProvider,
      mongodbProvider,
      adminManager,
    }
  }

  /// Import data from cloud MongoDB to local JSON
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = require_mongo(&self.mongodbProvider)?;

    match mongodbProvider
      .mongodbSync
      .importToLocal(userId, &self.jsonProvider)
      .await
    {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Data imported to local JSON DB successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error importing data: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Export data from local JSON to cloud MongoDB
  pub async fn exportToCloud(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = require_mongo(&self.mongodbProvider)?;

    match mongodbProvider
      .mongodbSync
      .exportToCloud(userId, &self.jsonProvider)
      .await
    {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Data exported to cloud MongoDB successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error exporting data: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Get all data for admin view (from MongoDB)
  pub async fn getAllDataForAdmin(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.getAllDataForAdmin().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Get all data for Archive page from local JSON (all users, includes deleted)
  pub async fn getAllDataForArchive(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.getAllDataForArchive().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Permanently delete a record with cascade to children
  pub async fn permanentlyDeleteRecord(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.permanentlyDeleteRecord(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade to children
  pub async fn toggleDeleteStatus(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.toggleDeleteStatus(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
