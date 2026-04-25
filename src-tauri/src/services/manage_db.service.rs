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
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub admin_manager: Option<AdminManager>,
}

impl ManageDbService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    cascade_service: CascadeService,
    entity_resolution: Arc<EntityResolutionService>,
  ) -> Self {
    let admin_manager = mongodb_provider.clone().map(|mp| {
      AdminManager::new(
        json_provider.clone(),
        mp,
        cascade_service,
        entity_resolution.clone(),
      )
    });

    Self {
      json_provider,
      mongodb_provider,
      admin_manager,
    }
  }

  /// Import data from cloud MongoDB to local JSON
  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

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
      let filter = Filter::And(vec![
        Filter::Eq("user_id".to_string(), json!(user_id)),
        Filter::IsNull("deleted_at".to_string()),
      ]);

      if let Ok(items) = mongo
        .find_many(table, Some(&filter), None, None, None, true)
        .await
      {
        for item in items {
          if self.json_provider.insert(table, item).await.is_ok() {
            imported_count += 1;
          }
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Imported {} records", imported_count),
      data: DataValue::String(imported_count.to_string()),
    })
  }

  /// Export data from local JSON to cloud MongoDB
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

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
      let filter = Filter::And(vec![
        Filter::Eq("user_id".to_string(), json!(user_id)),
        Filter::IsNull("deleted_at".to_string()),
      ]);

      if let Ok(items) = self
        .json_provider
        .find_many(table, Some(&filter), None, None, None, true)
        .await
      {
        for item in items {
          if mongo.insert(table, item).await.is_ok() {
            exported_count += 1;
          }
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Exported {} records", exported_count),
      data: DataValue::String(exported_count.to_string()),
    })
  }

  /// Get all data for admin view (from MongoDB)
  pub async fn get_all_data_for_admin(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.get_all_data_for_admin().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Get all data for Archive page from local JSON (all users, includes deleted)
  pub async fn get_all_data_for_archive(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.get_all_data_for_archive().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Permanently delete a record with cascade to children (MongoDB - Admin page)
  pub async fn permanently_delete_record(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.permanently_delete_record(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Permanently delete a record with cascade to children (local JSON - Archive page)
  pub async fn permanently_delete_record_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.permanently_delete_record_local(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade to children (MongoDB - Admin page)
  pub async fn toggle_delete_status(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.toggle_delete_status(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade to children (local JSON - Archive page)
  pub async fn toggle_delete_status_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.toggle_delete_status_local(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
