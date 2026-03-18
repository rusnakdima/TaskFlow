/* sys lib */
use serde_json::json;
use std::sync::Arc;

/* providers */
use crate::providers::{
  base_crud::CrudProvider, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::common::convertDataToObject;
use crate::helpers::response_helper::errResponseFormatted;
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

    // Get ALL users from local JSON (including deleted)
    let users = match self.jsonProvider.getAllWithDeleted("users", None).await {
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
    let profiles = match self.jsonProvider.getAllWithDeleted("profiles", None).await {
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

    // Get ALL data for each table (including deleted)
    for table in tables {
      let docs = match self.jsonProvider.getAllWithDeleted(table, None).await {
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

  /// Get all data for admin view with relations (includes deleted and non-deleted records)
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

    // Get all users with profiles from MongoDB
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

    let userRels = relation_definitions::getUserRelations();
    for user in &mut users {
      let _ = self
        .mongodbProvider
        .mongodbRelations
        .handleRelations(user, &userRels)
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
    let cascade_ids = if table == "todos" || table == "tasks" || table == "subtasks" {
      if let Some(ref handler) = self.cascadeService.mongoHandler {
        handler.collectCascadeIds(&table, &id).await?
      } else {
        crate::services::cascade::cascade_ids::CascadeIds::default()
      }
    } else {
      crate::services::cascade::cascade_ids::CascadeIds::default()
    };

    self
      .mongodbProvider
      .mongodbCrud
      .hardDelete(&table, &id)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error deleting record from MongoDB: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    Self::hard_delete_cascade_ids_mongo(&self.mongodbProvider, &cascade_ids).await?;

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
    let cascade_ids = if table == "todos" || table == "tasks" || table == "subtasks" {
      if let Some(ref handler) = self.cascadeService.jsonHandler {
        handler.collectCascadeIds(&table, &id).await?
      } else {
        crate::services::cascade::cascade_ids::CascadeIds::default()
      }
    } else {
      crate::services::cascade::cascade_ids::CascadeIds::default()
    };

    self
      .jsonProvider
      .hardDelete(&table, &id)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error deleting record from local JSON: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    Self::hard_delete_cascade_ids_json(&self.jsonProvider, &cascade_ids).await?;

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
      .mongodbCrud
      .get(&table, &id)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Record not found in MongoDB: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    let (newStatus, updateVal) = Self::build_toggle_update(&record);

    // Update parent first (H-6): if cascade fails the parent is already consistent
    self
      .mongodbProvider
      .mongodbCrud
      .update(&table, &id, updateVal)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error updating MongoDB record: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    self
      .cascadeService
      .handleMongoCascade(&table, &id, /* is_restore = */ !newStatus)
      .await?;

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
      .get(&table, &id)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Record not found in local database: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    let (newStatus, updateVal) = Self::build_toggle_update(&record);

    // Update parent first (H-6): if cascade fails the parent is already consistent
    self
      .jsonProvider
      .update(&table, &id, updateVal)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error updating local record: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    self
      .cascadeService
      .handleJsonCascade(&table, &id, /* is_restore = */ !newStatus)
      .await?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!(
        "Record delete status toggled to {} in local database",
        newStatus
      ),
      data: DataValue::Bool(newStatus),
    })
  }

  /// Build the updated record value for a toggle-delete operation.
  /// Returns `(new_is_deleted_status, updated_record)`.
  fn build_toggle_update(record: &serde_json::Value) -> (bool, serde_json::Value) {
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
    (newStatus, updateVal)
  }

  async fn hard_delete_cascade_ids_mongo(
    provider: &Arc<MongodbProvider>,
    cascade_ids: &crate::services::cascade::cascade_ids::CascadeIds,
  ) -> Result<(), ResponseModel> {
    for id in &cascade_ids.taskIds {
      provider
        .mongodbCrud
        .hardDelete("tasks", id)
        .await
        .map_err(|e| errResponseFormatted("Hard-delete cascade failed for task", &e.to_string()))?;
    }
    for id in &cascade_ids.subtaskIds {
      provider
        .mongodbCrud
        .hardDelete("subtasks", id)
        .await
        .map_err(|e| {
          errResponseFormatted("Hard-delete cascade failed for subtask", &e.to_string())
        })?;
    }
    for id in &cascade_ids.commentIds {
      provider
        .mongodbCrud
        .hardDelete("comments", id)
        .await
        .map_err(|e| {
          errResponseFormatted("Hard-delete cascade failed for comment", &e.to_string())
        })?;
    }
    for id in &cascade_ids.chatIds {
      provider
        .mongodbCrud
        .hardDelete("chats", id)
        .await
        .map_err(|e| errResponseFormatted("Hard-delete cascade failed for chat", &e.to_string()))?;
    }
    Ok(())
  }

  async fn hard_delete_cascade_ids_json(
    provider: &JsonProvider,
    cascade_ids: &crate::services::cascade::cascade_ids::CascadeIds,
  ) -> Result<(), ResponseModel> {
    // Delete tasks first so that inline comments inside them are gone before we
    // attempt to remove individual comment entries (avoids double-work).
    for id in &cascade_ids.taskIds {
      provider
        .hardDelete("tasks", id)
        .await
        .map_err(|e| errResponseFormatted("Hard-delete cascade failed for task", &e.to_string()))?;
    }
    for id in &cascade_ids.subtaskIds {
      provider.hardDelete("subtasks", id).await.map_err(|e| {
        errResponseFormatted("Hard-delete cascade failed for subtask", &e.to_string())
      })?;
    }
    // Comments are stored inline inside tasks/subtasks in JSON — use the dedicated helper.
    // Any comments whose parent task/subtask was already deleted above are silently skipped.
    for id in &cascade_ids.commentIds {
      provider.hardDeleteInlineComment(id).await.map_err(|e| {
        errResponseFormatted("Hard-delete cascade failed for comment", &e.to_string())
      })?;
    }
    for id in &cascade_ids.chatIds {
      provider
        .hardDelete("chats", id)
        .await
        .map_err(|e| errResponseFormatted("Hard-delete cascade failed for chat", &e.to_string()))?;
    }
    Ok(())
  }
}
