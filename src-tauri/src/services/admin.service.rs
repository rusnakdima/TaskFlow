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

  /// Get ALL data from local JSON for a specific user (includes deleted records)
  /// This allows users to manage their own data and restore deleted records
  #[allow(dead_code)]
  pub async fn getAllDataForUser(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      ("todos", "userId"),
      ("tasks", "todoId"),
      ("subtasks", "taskId"),
      ("categories", "userId"),
      ("daily_activities", "userId"),
    ];

    let mut allData = std::collections::HashMap::new();

    // Get user data from local JSON
    let userFilter = serde_json::json!({ "id": userId });
    let users = match self.jsonProvider.getAll("users", Some(userFilter)).await {
      Ok(u) => u,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting user: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    allData.insert("users".to_string(), users);

    // Get user's profile from local JSON
    let profileFilter = serde_json::json!({ "userId": userId });
    let profiles = match self.jsonProvider.getAll("profiles", Some(profileFilter)).await {
      Ok(p) => p,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting profile: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    allData.insert("profiles".to_string(), profiles);

    // Get all todos for this user (including deleted)
    for (table, filterField) in tables {
      let filter = serde_json::json!({ filterField: userId });
      let docs = match self.jsonProvider.getAll(table, Some(filter)).await {
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

    // For tasks and subtasks, we need to get them by relation, not userId
    // Get todos first to collect todoIds
    let todoIds: Vec<String> = match allData.get("todos") {
      Some(arr) => arr
        .iter()
        .filter_map(|doc| doc.get("id").and_then(|id| id.as_str()).map(String::from))
        .collect(),
      None => Vec::new(),
    };

    if !todoIds.is_empty() {
      // Get tasks by todoId
      let taskFilter = serde_json::json!({ "todoId": { "$in": &todoIds } });
      let tasks = match self.jsonProvider.getAll("tasks", Some(taskFilter)).await {
        Ok(t) => t,
        Err(_) => Vec::new(),
      };

      // Get task IDs from tasks before inserting into allData
      let taskIds: Vec<String> = tasks
        .iter()
        .filter_map(|doc| doc.get("id").and_then(|id| id.as_str()).map(String::from))
        .collect();

      allData.insert("tasks".to_string(), tasks);

      if !taskIds.is_empty() {
        // Get subtasks by taskId
        let subtaskFilter = serde_json::json!({ "taskId": { "$in": &taskIds } });
        let subtasks = match self.jsonProvider.getAll("subtasks", Some(subtaskFilter)).await {
          Ok(s) => s,
          Err(_) => Vec::new(),
        };
        allData.insert("subtasks".to_string(), subtasks);
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "User data retrieved successfully from local database".to_string(),
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

  /// Permanently delete a record and all its children (cascade hard delete)
  pub async fn permanentlyDeleteRecordWithCascade(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    // Step 1: Collect all cascade IDs using MongoDB (admin operations are on MongoDB)
    // We use collectCascadeIds directly to just get IDs without doing soft delete
    let cascade_ids = if table == "todos" || table == "tasks" {
      // Use the mongo cascade handler to collect IDs (without updating)
      if let Some(ref handler) = self.cascadeService.mongoHandler {
        handler.collectCascadeIds(&table, &id).await?
      } else {
        crate::services::cascade::cascade_ids::CascadeIds::default()
      }
    } else {
      crate::services::cascade::cascade_ids::CascadeIds::default()
    };

    // Step 2: Hard delete the main record
    let record = self
      .mongodbProvider
      .get(&table, &id)
      .await
      .unwrap_or_default();
    let userId = self
      .entityResolution
      .getUserIdForEntity(&table, &record)
      .await;

    // Hard delete from MongoDB
    self.mongodbProvider.hardDelete(&table, &id).await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error deleting record from cloud: {}", e),
        data: DataValue::String("".to_string()),
      })?;

    // Hard delete from local JSON
    let _ = self.jsonProvider.hardDelete(&table, &id).await;

    // Step 3: Hard delete all children from both MongoDB and JSON
    // Delete tasks
    for task_id in &cascade_ids.task_ids {
      let _ = self.mongodbProvider.hardDelete("tasks", task_id).await;
      let _ = self.jsonProvider.hardDelete("tasks", task_id).await;
    }

    // Delete subtasks
    for subtask_id in &cascade_ids.subtask_ids {
      let _ = self.mongodbProvider.hardDelete("subtasks", subtask_id).await;
      let _ = self.jsonProvider.hardDelete("subtasks", subtask_id).await;
    }

    // Delete comments
    for comment_id in &cascade_ids.comment_ids {
      let _ = self.mongodbProvider.hardDelete("comments", comment_id).await;
      let _ = self.jsonProvider.hardDelete("comments", comment_id).await;
    }

    // Delete chats
    for chat_id in &cascade_ids.chat_ids {
      let _ = self.mongodbProvider.hardDelete("chats", chat_id).await;
      let _ = self.jsonProvider.hardDelete("chats", chat_id).await;
    }

    // Step 4: Re-sync user data if needed
    if let Some(uid) = userId {
      let _ = self
        .mongodbProvider
        .mongodbSync
        .importToLocal(uid, &self.jsonProvider)
        .await;
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Record and all children permanently deleted".to_string(),
      data: DataValue::String(id),
    })
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
