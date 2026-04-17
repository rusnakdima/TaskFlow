/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::providers::{JsonProvider, MongoProvider};

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  relation_obj::RelationObj,
  response_entity::{DataValue, ResponseModel},
  sync_metadata_entity::SyncMetadata,
  table_entity::validateModel,
};

/* helpers */
use crate::helpers::{
  common::getProviderType,
  response_helper::{errResponse, errResponseFormatted, successResponse},
  user_sync_helper,
};

/* services */
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::cascade::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

#[derive(Clone)]
pub struct RepositoryService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub cascadeService: CascadeService,
  pub entityResolution: Arc<EntityResolutionService>,
  pub activityMonitor: ActivityMonitorService,
}

impl RepositoryService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
    cascadeService: CascadeService,
    entityResolution: Arc<EntityResolutionService>,
    activityMonitor: ActivityMonitorService,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      cascadeService,
      entityResolution,
      activityMonitor,
    }
  }

  fn use_json_provider(&self, sync_metadata: Option<&SyncMetadata>) -> bool {
    if self.mongodbProvider.is_none() {
      return true;
    }
    if let Some(metadata) = sync_metadata {
      match getProviderType(metadata) {
        Ok(ProviderType::Json) => true,
        Ok(ProviderType::Mongo) => false,
        Err(_) => true,
      }
    } else {
      true
    }
  }

  /// Orchestrate CRUD operations with provider type selection based on SyncMetadata
  pub async fn execute(
    &self,
    operation: String,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    match operation.as_str() {
      "getAll" => {
        self
          .handleGetAll(table, filter, relations, load, sync_metadata)
          .await
      }
      "get" => {
        self
          .handleGet(table, id, relations, load, sync_metadata)
          .await
      }
      "create" => self.handleCreate(table, data, sync_metadata).await,
      "update" => self.handleUpdate(table, id, data, sync_metadata).await,
      "updateAll" => self.handleUpdateAll(table, data, sync_metadata).await,
      "delete" => self.handleDelete(table, id, sync_metadata).await,
      "restore" => self.handleRestore(table, id, sync_metadata).await,
      _ => Err(errResponse(&format!("Unknown operation: {}", operation))),
    }
  }

  async fn handleGetAll(
    &self,
    table: String,
    filter: Option<Value>,
    _relations: Option<Vec<RelationObj>>,
    _load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    // For profiles table with userId filter: check local first, then cloud import if not found
    if table == "profiles" {
      if let Some(ref f) = filter {
        if let Some(user_id) = f.get("userId").and_then(|v| v.as_str()) {
          return self.getOrImportProfile(user_id).await;
        }
      }
    }

    let mut docs = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .find_all(&table)
        .await
        .map_err(|e| errResponseFormatted("Get all failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .find_all(&table)
        .await
        .map_err(|e| errResponseFormatted("Get all failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    // Auto-load relations for decentralized storage
    if table == "todos" {
      docs = match self.loadTodoRelations(docs).await {
        Ok(loaded) => loaded,
        Err(e) => return Err(e),
      };
    }

    Ok(successResponse(DataValue::Array(docs)))
  }

  async fn getOrImportProfile(
    &self,
    user_id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    // Check local first
    if let Ok(local_profiles) = self.jsonProvider.find_all("profiles").await {
      for p in local_profiles {
        if p.get("userId").and_then(|v| v.as_str()) == Some(user_id) {
          return Ok(successResponse(DataValue::Object(p)));
        }
      }
    }

    // Not in local, check cloud and import
    if let Some(ref mongo) = self.mongodbProvider {
      if let Ok(cloud_profiles) = mongo.find_all("profiles").await {
        for p in cloud_profiles {
          if p.get("userId").and_then(|v| v.as_str()) == Some(user_id) {
            let _ = self.jsonProvider.insert("profiles", p.clone()).await;
            return Ok(successResponse(DataValue::Object(p)));
          }
        }
      }
    }

    // Not found anywhere
    Ok(successResponse(DataValue::Object(serde_json::json!({ "userId": user_id }))))
  }

  async fn loadTodoRelations(
    &self,
    mut todos: Vec<serde_json::Value>,
  ) -> Result<Vec<serde_json::Value>, ResponseModel> {
    // Get all tasks from db
    let tasks = self.jsonProvider.find_all("tasks").await.unwrap_or_default();
    
    let tasks_by_todo: std::collections::HashMap<String, Vec<serde_json::Value>> = {
      let mut map = std::collections::HashMap::new();
      for task in &tasks {
        if let Some(todo_id) = task.get("todoId").and_then(|v| v.as_str()) {
          map.entry(todo_id.to_string())
            .or_insert_with(Vec::new)
            .push(task.clone());
        }
      }
      map
    };
    
    for todo in todos.iter_mut() {
      let todo_id = todo.get("id").and_then(|v| v.as_str()).unwrap_or("");
      let related_tasks = tasks_by_todo.get(todo_id).cloned().unwrap_or_default();
      
      if let Some(obj) = todo.as_object_mut() {
        obj.insert("tasks".to_string(), serde_json::Value::Array(related_tasks));
      }
    }
    
    Ok(todos)
  }

  async fn handleGet(
    &self,
    table: String,
    id: Option<String>,
    _relations: Option<Vec<RelationObj>>,
    _load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for get"))?;

    let doc = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .find_by_id(&table, &idStr)
        .await
        .map_err(|e| errResponseFormatted("Get failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .find_by_id(&table, &idStr)
        .await
        .map_err(|e| errResponseFormatted("Get failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    match doc {
      Some(d) => Ok(successResponse(DataValue::Object(d))),
      None => Err(errResponse(&format!("{} not found", idStr))),
    }
  }

  async fn handleCreate(
    &self,
    table: String,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| errResponse("Data required for create"))?;

    if table == "profiles" {
      return self.createProfileWithUserUpdate(data_val).await;
    }

    let validated_data = validateModel(&table, &data_val, true)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let created_record = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .insert(&table, validated_data.clone())
        .await
        .map_err(|e| errResponseFormatted("Create failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .insert(&table, validated_data.clone())
        .await
        .map_err(|e| errResponseFormatted("Create failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    self
      .activityMonitor
      .logAction(&table, "create", &created_record, None)
      .await;
    Ok(successResponse(DataValue::Object(created_record)))
  }

  async fn handleUpdate(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for update"))?;
    let data_val = data.ok_or_else(|| errResponse("Data required for update"))?;

    let validated_data = validateModel(&table, &data_val, false)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let updated_record = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .update(&table, &idStr, validated_data.clone())
        .await
        .map_err(|e| errResponseFormatted("Update failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .update(&table, &idStr, validated_data.clone())
        .await
        .map_err(|e| errResponseFormatted("Update failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    self
      .activityMonitor
      .logAction(&table, "update", &updated_record, None)
      .await;
    Ok(successResponse(DataValue::Object(updated_record)))
  }

  async fn handleUpdateAll(
    &self,
    table: String,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| errResponse("Data required for updateAll"))?;

    let raw_records = data_val
      .as_array()
      .ok_or_else(|| errResponse("Data must be an array for updateAll"))?
      .clone();

    let mut validated_records: Vec<Value> = Vec::with_capacity(raw_records.len());
    for record in raw_records {
      let validated = validateModel(&table, &record, false)
        .map_err(|e| errResponseFormatted("Validation failed in updateAll", &e))?;
      validated_records.push(validated);
    }

    for record in &validated_records {
      if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
        let _ = if self.use_json_provider(sync_metadata.as_ref()) {
          self.jsonProvider.update(&table, id, record.clone()).await
        } else if let Some(ref mongo) = self.mongodbProvider {
          mongo.update(&table, id, record.clone()).await
        } else {
          return Err(errResponse("No provider available"));
        };
      }
    }

    Ok(successResponse(DataValue::Array(validated_records)))
  }

  async fn handleDelete(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for delete"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let _ = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .delete(&table, &idStr)
        .await
        .map_err(|e| errResponseFormatted("Delete failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .delete(&table, &idStr)
        .await
        .map_err(|e| errResponseFormatted("Delete failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    match provider_type {
      ProviderType::Mongo => {
        self
          .cascadeService
          .handleMongoCascade(&table, &idStr, false)
          .await?;
        let _ = self
          .cascadeService
          .handleJsonCascade(&table, &idStr, false)
          .await;
      }
      _ => {
        self
          .cascadeService
          .handleJsonCascade(&table, &idStr, false)
          .await?;
      }
    }

    self
      .activityMonitor
      .logAction(&table, "delete", &json!({"id": idStr.clone()}), None)
      .await;
    Ok(successResponse(DataValue::String(idStr)))
  }

  async fn handleRestore(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for restore"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let patch = json!({ "deleted_at": serde_json::Value::Null });

    let _ = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .patch(&table, &idStr, patch)
        .await
        .map_err(|e| errResponseFormatted("Restore failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .patch(&table, &idStr, patch)
        .await
        .map_err(|e| errResponseFormatted("Restore failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    match provider_type {
      ProviderType::Mongo => {
        self
          .cascadeService
          .handleMongoCascade(&table, &idStr, true)
          .await?;
      }
      _ => {
        self
          .cascadeService
          .handleJsonCascade(&table, &idStr, true)
          .await?;
      }
    }

    Ok(successResponse(DataValue::String(idStr)))
  }

  async fn createProfileWithUserUpdate(
    &self,
    profileData: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    let validatedProfile = validateModel("profiles", &profileData, true)
      .map_err(|e| errResponseFormatted("Profile validation failed", &e))?;

    let userId = validatedProfile
      .get("userId")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if userId.is_empty() {
      return Err(errResponse("Invalid profile data: userId is required"));
    }

    let createdProfile = self
      .jsonProvider
      .insert("profiles", validatedProfile.clone())
      .await
      .map_err(|e| errResponseFormatted("Error creating profile in local store", &e.to_string()))?;

    let profileId = createdProfile
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();
    user_sync_helper::updateUserProfileIdJson(&self.jsonProvider, &userId, &profileId).await?;

    self
      .activityMonitor
      .logAction("profiles", "create", &createdProfile, None)
      .await;
    Ok(successResponse(DataValue::Object(createdProfile)))
  }
}
