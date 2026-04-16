/* sys */
use std::sync::Arc;

/* providers */
use nosql_orm::providers::{JsonProvider, MongoProvider};

/* entities */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* services */
use crate::services::{
  admin_manager::AdminManager, cascade::CascadeService,
  entity_resolution_service::EntityResolutionService,
};

/// ManageDbService - Facade for database management operations
pub struct ManageDbService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub adminManager: Option<AdminManager>,
}

impl ManageDbService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
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
  pub async fn importToLocal(&self, _userId: String) -> Result<ResponseModel, ResponseModel> {
    Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "importToLocal not yet implemented with nosql_orm".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  /// Export data from local JSON to cloud MongoDB
  pub async fn exportToCloud(&self, _userId: String) -> Result<ResponseModel, ResponseModel> {
    Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "exportToCloud not yet implemented with nosql_orm".to_string(),
      data: DataValue::String("".to_string()),
    })
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

  /// Permanently delete a record with cascade to children (MongoDB - Admin page)
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

  /// Permanently delete a record with cascade to children (local JSON - Archive page)
  pub async fn permanentlyDeleteRecordLocal(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.permanentlyDeleteRecordLocal(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade to children (MongoDB - Admin page)
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

  /// Toggle delete status of a record with cascade to children (local JSON - Archive page)
  pub async fn toggleDeleteStatusLocal(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.adminManager {
      Some(manager) => manager.toggleDeleteStatusLocal(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
