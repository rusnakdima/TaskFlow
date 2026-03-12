/* sys lib */
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::common::convertDataToObject;
use crate::helpers::timestamp_helper;

/* services */
use crate::services::admin::relation_definitions;
use crate::services::cascade::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

/* AdminManager - Handles admin operations for data management */
pub struct AdminManager {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
  pub cascadeService: CascadeService,
  pub entityResolution: Arc<EntityResolutionService>,
}

impl AdminManager {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
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

  /// Get all data for admin view with relations (includes deleted and non-deleted records)
  pub async fn getAllDataForAdmin(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    let mut allData = std::collections::HashMap::new();

    // Get all users with profiles
    let mut users = match self.mongodbProvider.getAllWithDeleted("users", None).await {
      Ok(u) => u,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting users: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let user_rels = relation_definitions::getUserRelations();
    for user in &mut users {
      let _ = self
        .mongodbProvider
        .mongodbRelations
        .handleRelations(user, &user_rels)
        .await;
    }

    allData.insert("users".to_string(), users);

    for table in tables {
      let relations = relation_definitions::getTableRelations(table);

      let mut docs = match self.mongodbProvider.getAllWithDeleted(table, None).await {
        Ok(d) => d,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data for {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      };

      if let Some(rels) = relations {
        for doc in &mut docs {
          let _ = self
            .mongodbProvider
            .mongodbRelations
            .handleRelations(doc, &rels)
            .await;
        }
      }

      allData.insert(table.to_string(), docs);
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Admin data retrieved successfully".to_string(),
      data: convertDataToObject(&allData),
    })
  }

  /// Permanently delete a record from MongoDB and its local copy
  pub async fn permanentlyDeleteRecord(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let record = self
      .mongodbProvider
      .get(&table, &id)
      .await
      .unwrap_or_default();
    let userId = self
      .entityResolution
      .getUserIdForEntity(&table, &record)
      .await;

    match self.mongodbProvider.hardDelete(&table, &id).await {
      Ok(_) => {
        let _ = self.jsonProvider.hardDelete(&table, &id).await;

        // If it was a user or profile, we might need a full re-sync
        if let Some(uid) = userId {
          let _ = self
            .mongodbProvider
            .mongodbSync
            .importToLocal(uid, &self.jsonProvider)
            .await;
        }

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "Record permanently deleted".to_string(),
          data: DataValue::String(id),
        })
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error deleting record from cloud: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle isDeleted status for a record and all its children
  pub async fn toggleDeleteStatus(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let record = match self.mongodbProvider.get(&table, &id).await {
      Ok(doc) => doc,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Record not found: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let isDeleted = record
      .get("isDeleted")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    let newStatus = !isDeleted;
    let timestamp = timestamp_helper::getCurrentTimestamp();

    let mut updateVal = record.clone();
    if let Some(obj) = updateVal.as_object_mut() {
      obj.insert("isDeleted".to_string(), json!(newStatus));
      obj.insert("updatedAt".to_string(), json!(timestamp));
    }

    // Handle children recursively via CascadeService
    self
      .cascadeService
      .handleMongoCascade(&table, &id, isDeleted) // isDeleted is the original status, so if it was deleted, handleMongoCascade(isRestore=true)
      .await?;

    match self.mongodbProvider.update(&table, &id, updateVal).await {
      Ok(_) => {
        // Sync to local
        let userId = self
          .entityResolution
          .getUserIdForEntity(&table, &record)
          .await;
        if let Some(uid) = userId {
          let _ = self
            .mongodbProvider
            .mongodbSync
            .importToLocal(uid, &self.jsonProvider)
            .await;
        }

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: format!("Record delete status toggled to {}", newStatus),
          data: DataValue::Bool(newStatus),
        })
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error updating cloud record: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
