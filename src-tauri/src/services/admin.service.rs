/* sys lib */
use std::collections::HashMap;
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
    let mut all_data = HashMap::new();

    let users = self
      .json_provider
      .find_all("users")
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting users: {}", e),
        data: DataValue::String("".to_string()),
      })?;
    all_data.insert("users".to_string(), users);

    let profiles = self
      .json_provider
      .find_all("profiles")
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting profiles: {}", e),
        data: DataValue::String("".to_string()),
      })?;
    all_data.insert("profiles".to_string(), profiles);

    for table in tables {
      let docs = self
        .json_provider
        .find_all(table)
        .await
        .map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting data for {}: {}", table, e),
          data: DataValue::String("".to_string()),
        })?;
      all_data.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Archive data retrieved successfully from local database".to_string(),
      data: convert_data_to_object(&all_data),
    })
  }

  pub async fn get_archive_data_paginated(
    &self,
    data_type: String,
    skip: u64,
    limit: u64,
  ) -> Result<ResponseModel, ResponseModel> {
    let docs = self
      .json_provider
      .find_many(&data_type, None, Some(skip), Some(limit), None, true)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting paginated {} data: {}", data_type, e),
        data: DataValue::String("".to_string()),
      })?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Retrieved {} {} records", docs.len(), data_type),
      data: convert_data_to_object(&docs),
    })
  }

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
    let mut all_data = HashMap::new();

    let users = self
      .mongodb_provider
      .find_all("users")
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting users: {}", e),
        data: DataValue::String("".to_string()),
      })?;
    all_data.insert("users".to_string(), users);

    for table in tables {
      let docs = self
        .mongodb_provider
        .find_all(table)
        .await
        .map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting data for {}: {}", table, e),
          data: DataValue::String("".to_string()),
        })?;
      all_data.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Admin data retrieved successfully from MongoDB".to_string(),
      data: convert_data_to_object(&all_data),
    })
  }

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
    } else if let Some(ref mongo) = self.cascade_service.mongodb_provider {
      let _ = mongo.delete(&table, &id).await;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Record and all children permanently deleted from MongoDB".to_string(),
      data: DataValue::String(id),
    })
  }

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
      .and_then(|v| v.as_bool())
      .unwrap_or(false);

    if !is_deleted {
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
      message: format!("Record delete status toggled to {} in MongoDB", !is_deleted),
      data: DataValue::Bool(!is_deleted),
    })
  }

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
      .and_then(|v| v.as_bool())
      .unwrap_or(false);

    if !is_deleted {
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
        !is_deleted
      ),
      data: DataValue::Bool(!is_deleted),
    })
  }
}
