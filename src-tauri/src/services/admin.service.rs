/* sys lib */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongoProvider};
use nosql_orm::provider::DatabaseProvider;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::common::convertDataToObject;

/* services */
use crate::services::cascade::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

/* AdminManager - Handles admin operations for data management */
pub struct AdminManager {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongoProvider>,
  pub cascadeService: CascadeService,
  pub entityResolution: Arc<EntityResolutionService>,
}

impl AdminManager {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongoProvider>,
    cascadeService: CascadeService,
    entityResolution: Arc<EntityResolutionService>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      cascadeService,
      entityResolution,
    }
  }

  /// Get ALL local data for Archive page (all users, includes deleted records)
  /// This allows users to view and restore any deleted data from local storage
  /// Data source: Local JSON database only
  pub async fn getAllDataForArchive(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "comments",
      "chats",
      "categories",
      "daily_activities",
    ];

    let mut allData = std::collections::HashMap::new();

    // Get ALL users from local JSON
    let users = match self.jsonProvider.find_all("users").await {
      Ok(u) => u,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting users: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    allData.insert("users".to_string(), users);

    // Get ALL profiles from local JSON
    let profiles = match self.jsonProvider.find_all("profiles").await {
      Ok(p) => p,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting profiles: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    allData.insert("profiles".to_string(), profiles);

    // Get ALL data for each table
    for table in tables {
      let docs = match self.jsonProvider.find_all(table).await {
        Ok(d) => d,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data for {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      };
      allData.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Archive data retrieved successfully from local database".to_string(),
      data: convertDataToObject(&allData),
    })
  }

  /// Get all data for admin view (includes deleted and non-deleted records)
  /// Only accessible by admin users - fetches from MongoDB
  pub async fn getAllDataForAdmin(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "comments",
      "chats",
      "categories",
      "daily_activities",
    ];

    let mut allData = std::collections::HashMap::new();

    // Get all users from MongoDB
    let users = match self.mongodbProvider.find_all("users").await {
      Ok(u) => u,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting users: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    allData.insert("users".to_string(), users);

    for table in tables {
      let docs = match self.mongodbProvider.find_all(table).await {
        Ok(d) => d,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data for {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      };
      allData.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Admin data retrieved successfully from MongoDB".to_string(),
      data: convertDataToObject(&allData),
    })
  }

  /// Permanently delete a record and all its children (cascade hard delete)
  /// Works with MongoDB (admin page) - deletes only from MongoDB
  pub async fn permanentlyDeleteRecord(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    if table == "todos" || table == "tasks" || table == "subtasks" {
      if self.cascadeService.mongodb_provider.is_some() {
        self
          .cascadeService
          .permanent_delete_cascade_mongo(&table, &id)
          .await?;
      }
      let _ = self
        .cascadeService
        .permanent_delete_cascade_json(&table, &id)
        .await;
    } else {
      if let Some(ref mongo) = self.cascadeService.mongodb_provider {
        let _ = mongo.delete(&table, &id).await;
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Record and all children permanently deleted from MongoDB".to_string(),
      data: DataValue::String(id),
    })
  }

  /// Permanently delete a record and all its children from local JSON only (Archive page)
  pub async fn permanentlyDeleteRecordLocal(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    if table == "todos" || table == "tasks" || table == "subtasks" {
      self
        .cascadeService
        .permanent_delete_cascade_json(&table, &id)
        .await?;
    } else {
      let _ = self.jsonProvider.delete(&table, &id).await;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Record and all children permanently deleted from local database".to_string(),
      data: DataValue::String(id),
    })
  }

  /// Toggle isDeleted status for a record and all its children
  /// Works with MongoDB (admin page) - updates only MongoDB
  pub async fn toggleDeleteStatus(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let record = self
      .mongodbProvider
      .find_by_id(&table, &id)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Record not found in MongoDB: {}", e),
        data: DataValue::String("".to_string()),
      })?
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "Record not found".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let isDeleted = record
      .get("deleted_at")
      .map(|v| !v.is_null())
      .unwrap_or(false);
    let newStatus = !isDeleted;

    if newStatus {
      self
        .cascadeService
        .soft_delete_cascade_mongo(&table, &id)
        .await?;
    } else {
      self
        .cascadeService
        .restore_cascade_mongo(&table, &id)
        .await?;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Record delete status toggled to {} in MongoDB", newStatus),
      data: DataValue::Bool(newStatus),
    })
  }

  /// Toggle isDeleted status for a record and all its children in local JSON only (Archive page)
  pub async fn toggleDeleteStatusLocal(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let record = self
      .jsonProvider
      .find_by_id(&table, &id)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Record not found in local database: {}", e),
        data: DataValue::String("".to_string()),
      })?
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "Record not found".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let isDeleted = record
      .get("deleted_at")
      .map(|v| !v.is_null())
      .unwrap_or(false);
    let newStatus = !isDeleted;

    if newStatus {
      self
        .cascadeService
        .soft_delete_cascade_json(&table, &id)
        .await?;
    } else {
      self
        .cascadeService
        .restore_cascade_json(&table, &id)
        .await?;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!(
        "Record delete status toggled to {} in local database",
        newStatus
      ),
      data: DataValue::Bool(newStatus),
    })
  }
}
