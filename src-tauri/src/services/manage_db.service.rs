/* sys */
use std::sync::Arc;

/* providers */
use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::json;

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
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    match self.mongodbProvider.as_ref() {
      Some(mongo_provider) => {
        let tables = vec![
          "users",
          "profiles",
          "todos",
          "tasks",
          "subtasks",
          "categories",
          "daily_activities",
        ];
        let mut imported_count = 0;

        for table in tables {
          let user_filter = Filter::Eq("userId".to_string(), json!(userId));
          let cloud_data = mongo_provider
            .find_many(table, Some(&user_filter), None, None, None, true)
            .await;

          if let Ok(items) = cloud_data {
            for item in items {
              let insert_result = self.jsonProvider.insert(table, item.clone()).await;
              if insert_result.is_ok() {
                imported_count += 1;
              }
            }
          }
        }

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: format!("Imported {} records to local", imported_count),
          data: DataValue::String(imported_count.to_string()),
        })
      }
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available for import".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Export data from local JSON to cloud MongoDB
  pub async fn exportToCloud(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    match self.mongodbProvider.as_ref() {
      Some(mongo_provider) => {
        let tables = vec![
          "users",
          "profiles",
          "todos",
          "tasks",
          "subtasks",
          "categories",
          "daily_activities",
        ];
        let mut exported_count = 0;

        for table in tables {
          let user_filter = Filter::Eq("userId".to_string(), json!(userId));
          let local_data = self
            .jsonProvider
            .find_many(table, Some(&user_filter), None, None, None, true)
            .await;

          if let Ok(items) = local_data {
            for item in items {
              let insert_result = mongo_provider.insert(table, item.clone()).await;
              if insert_result.is_ok() {
                exported_count += 1;
              }
            }
          }
        }

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: format!("Exported {} records to cloud", exported_count),
          data: DataValue::String(exported_count.to_string()),
        })
      }
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available for export".to_string(),
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
