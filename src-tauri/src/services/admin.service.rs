/* sys lib */
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongoProvider};
use nosql_orm::provider::DatabaseProvider;

/* models */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::common::convert_data_to_object;

/* services */
use crate::services::cascade::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

/* AdminManager - Handles admin operations for data management */
pub struct AdminManager {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Arc<MongoProvider>,
  pub cascade_service: CascadeService,
  pub entity_resolution: Arc<EntityResolutionService>,
}

impl AdminManager {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Arc<MongoProvider>,
    cascade_service: CascadeService,
    entity_resolution: Arc<EntityResolutionService>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      cascade_service,
      entity_resolution,
    }
  }

  /// Get ALL local data for Archive page (all users, includes deleted records)
  /// This allows users to view and restore any deleted data from local storage
  /// Data source: Local JSON database only
  pub async fn get_all_data_for_archive(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "comments",
      "chats",
      "categories",
      "daily_activities",
    ];

    let mut all_data = std::collections::HashMap::new();

    // Get ALL users from local JSON
    let users = match self.json_provider.find_all("users").await {
      Ok(u) => u,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting users: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    all_data.insert("users".to_string(), users);

    // Get ALL profiles from local JSON
    let profiles = match self.json_provider.find_all("profiles").await {
      Ok(p) => p,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting profiles: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    all_data.insert("profiles".to_string(), profiles);

    // Get ALL data for each table
    for table in tables {
      let docs = match self.json_provider.find_all(table).await {
        Ok(d) => d,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data for {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      };
      all_data.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Archive data retrieved successfully from local database".to_string(),
      data: convert_data_to_object(&all_data),
    })
  }

  /// Get all data for admin view (includes deleted and non-deleted records)
  /// Only accessible by admin users - fetches from MongoDB
  pub async fn get_all_data_for_admin(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "comments",
      "chats",
      "categories",
      "daily_activities",
    ];

    let mut all_data = std::collections::HashMap::new();

    // Get all users from MongoDB
    let users = match self.mongodb_provider.find_all("users").await {
      Ok(u) => u,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting users: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    all_data.insert("users".to_string(), users);

    for table in tables {
      let docs = match self.mongodb_provider.find_all(table).await {
        Ok(d) => d,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data for {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      };
      all_data.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Admin data retrieved successfully from MongoDB".to_string(),
      data: convert_data_to_object(&all_data),
    })
  }

  /// Permanently delete a record and all its children (cascade hard delete)
  /// Works with MongoDB (admin page) - deletes only from MongoDB
  pub async fn permanently_delete_record(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    if table == "todos" || table == "tasks" || table == "subtasks" {
      if self.cascade_service.mongodb_provider.is_some() {
        self
          .cascade_service
          .permanent_delete_cascade_mongo(&table, &id)
          .await?;
      }
      let _ = self
        .cascade_service
        .permanent_delete_cascade_json(&table, &id)
        .await;
    } else {
      if let Some(ref mongo) = self.cascade_service.mongodb_provider {
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
  pub async fn permanently_delete_record_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    if table == "todos" || table == "tasks" || table == "subtasks" {
      self
        .cascade_service
        .permanent_delete_cascade_json(&table, &id)
        .await?;
    } else {
      let _ = self.json_provider.delete(&table, &id).await;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Record and all children permanently deleted from local database".to_string(),
      data: DataValue::String(id),
    })
  }

  /// Toggle isDeleted status for a record and all its children
  /// Works with MongoDB (admin page) - updates only MongoDB
  pub async fn toggle_delete_status(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let record = self
      .mongodb_provider
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

    let is_deleted = record
      .get("deleted_at")
      .map(|v| !v.is_null())
      .unwrap_or(false);
    let new_status = !is_deleted;

    if new_status {
      self
        .cascade_service
        .soft_delete_cascade_mongo(&table, &id)
        .await?;
    } else {
      self
        .cascade_service
        .restore_cascade_mongo(&table, &id)
        .await?;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Record delete status toggled to {} in MongoDB", new_status),
      data: DataValue::Bool(new_status),
    })
  }

  /// Toggle isDeleted status for a record and all its children in local JSON only (Archive page)
  pub async fn toggle_delete_status_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let record = self
      .json_provider
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

    let is_deleted = record
      .get("deleted_at")
      .map(|v| !v.is_null())
      .unwrap_or(false);
    let new_status = !is_deleted;

    if new_status {
      self
        .cascade_service
        .soft_delete_cascade_json(&table, &id)
        .await?;
    } else {
      self
        .cascade_service
        .restore_cascade_json(&table, &id)
        .await?;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!(
        "Record delete status toggled to {} in local database",
        new_status
      ),
      data: DataValue::Bool(new_status),
    })
  }
}
