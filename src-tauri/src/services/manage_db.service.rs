/* sys */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/* services */
use crate::services::{
  admin_manager::AdminManager, cascade_service::CascadeService,
  entity_resolution_service::EntityResolutionService, export_manager::ExportManager,
  sync_manager::SyncManager,
};

/// ManageDbService - Facade for database management operations
/// Delegates to specialized managers: SyncManager, ExportManager, AdminManager
pub struct ManageDbService {
  pub syncManager: SyncManager,
  pub exportManager: ExportManager,
  pub adminManager: Option<AdminManager>,
}

impl ManageDbService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    cascadeService: CascadeService,
    entityResolution: Arc<EntityResolutionService>,
  ) -> Self {
    let syncManager = SyncManager::new(jsonProvider.clone(), mongodbProvider.clone());
    let exportManager = ExportManager::new(jsonProvider.clone(), mongodbProvider.clone());
    let adminManager = mongodbProvider.clone().map(|mp| {
      AdminManager::new(
        jsonProvider.clone(),
        mp,
        cascadeService,
        entityResolution.clone(),
      )
    });

    Self {
      syncManager,
      exportManager,
      adminManager,
    }
  }

  /// Import data from cloud to local
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    self.syncManager.importToLocal(userId).await
  }

  /// Export data from local to cloud
  pub async fn exportToCloud(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    self.exportManager.exportToCloud(userId).await
  }

  /// Get all data for admin view
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

  /// Permanently delete a record
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

  /// Toggle delete status of a record
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
