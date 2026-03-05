/* sys */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::ResponseModel;

/* managers */
use crate::services::{
  admin_manager::AdminManager, export_manager::ExportManager, sync_manager::SyncManager,
};

/// ManageDbService - Facade for database management operations
/// Delegates to specialized managers: SyncManager, ExportManager, AdminManager
pub struct ManageDbService {
  pub syncManager: SyncManager,
  pub exportManager: ExportManager,
  pub adminManager: Option<AdminManager>,
}

impl ManageDbService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    let sync_manager = SyncManager::new(jsonProvider.clone(), mongodbProvider.clone());
    let export_manager = ExportManager::new(jsonProvider.clone(), mongodbProvider.clone());
    let admin_manager = mongodbProvider.clone().map(AdminManager::new);

    Self {
      syncManager: sync_manager,
      exportManager: export_manager,
      adminManager: admin_manager,
    }
  }

  /// Import data from cloud to local
  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    self.syncManager.import_to_local(user_id).await
  }

  /// Export data from local to cloud
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    self.exportManager.export_to_cloud(user_id).await
  }

  /// Get all data for admin view
  pub async fn get_all_data_for_admin(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.get_all_data_for_admin().await,
      None => Err(crate::models::response_model::ResponseModel {
        status: crate::models::response_model::ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: crate::models::response_model::DataValue::String("".to_string()),
      }),
    }
  }

  /// Permanently delete a record
  pub async fn permanently_delete_record(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.permanently_delete_record(table, id).await,
      None => Err(crate::models::response_model::ResponseModel {
        status: crate::models::response_model::ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: crate::models::response_model::DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record
  pub async fn toggle_delete_status(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.toggle_delete_status(table, id).await,
      None => Err(crate::models::response_model::ResponseModel {
        status: crate::models::response_model::ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: crate::models::response_model::DataValue::String("".to_string()),
      }),
    }
  }

  /// Clean deleted records from local
  pub async fn clean_deleted_records_from_local(&self) -> Result<(), ResponseModel> {
    self.syncManager.clean_deleted_records_from_local().await
  }
}
