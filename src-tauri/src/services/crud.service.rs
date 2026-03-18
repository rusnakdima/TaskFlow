/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  provider_type_model::ProviderType,
  relation_obj::RelationObj,
  response_model::{DataValue, ResponseModel},
  sync_metadata_model::SyncMetadata,
  table_model::validateModel,
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

/* repositories */
use crate::repositories::routed_repository::RoutedRepository;

#[derive(Clone)]
pub struct CrudService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub cascadeService: CascadeService,
  pub entityResolution: Arc<EntityResolutionService>,
  pub activityMonitor: ActivityMonitorService,
  pub routedRepository: Arc<RoutedRepository>,
}

impl CrudService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    cascadeService: CascadeService,
    entityResolution: Arc<EntityResolutionService>,
    activityMonitor: ActivityMonitorService,
    routedRepository: Arc<RoutedRepository>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      cascadeService,
      entityResolution,
      activityMonitor,
      routedRepository,
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
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    match operation.as_str() {
      "getAll" => {
        self
          .handleGetAll(table, filter, relations, load, syncMetadata)
          .await
      }
      "get" => {
        self
          .handleGet(table, id, relations, load, syncMetadata)
          .await
      }
      "create" => self.handleCreate(table, data, syncMetadata).await,
      "update" => self.handleUpdate(table, id, data, syncMetadata).await,
      "updateAll" => self.handleUpdateAll(table, data, syncMetadata).await,
      "delete" => self.handleDelete(table, id, syncMetadata).await,
      "restore" => self.handleRestore(table, id, syncMetadata).await,
      _ => Err(errResponse(&format!("Unknown operation: {}", operation))),
    }
  }

  async fn handleGetAll(
    &self,
    table: String,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    // Determine which provider to use
    let providerType = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let repo = self.routedRepository.forTable(table.clone());

    let mut docs = repo
      .getAll(filter, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Get all failed", &e))?;

    // Use NEW batch loading with RelationLoader if load parameter is provided
    if let Some(loadPaths) = load {
      if !loadPaths.is_empty() {
        // Reset stats before batch loading
        match providerType {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              let _ = mongo.relationLoader.resetStats().await;
            }
          }
          _ => {
            let _ = self.jsonProvider.relationLoader.resetStats().await;
          }
        }

        // Use batch loading for efficiency - loads all relations for all entities at once
        let batchResult = match providerType {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              mongo
                .relationLoader
                .loadRelationsBatch(&mut docs, &table, &loadPaths)
                .await
            } else {
              Err("MongoDB provider not available".into())
            }
          }
          _ => {
            self
              .jsonProvider
              .relationLoader
              .loadRelationsBatch(&mut docs, &table, &loadPaths)
              .await
          }
        };

        // Propagate relation-loading errors so the caller knows data is incomplete (M-11)
        if let Err(e) = batchResult {
          return Err(errResponseFormatted(
            "Failed to load relations",
            &e.to_string(),
          ));
        }

        // Clear cache after request is complete
        match providerType {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              let _ = mongo.relationLoader.clearCache().await;
            }
          }
          _ => {
            let _ = self.jsonProvider.relationLoader.clearCache().await;
          }
        }
      }
    }

    // Fallback to old RelationObj approach for backward compatibility
    if let Some(rels) = relations {
      for doc in &mut docs {
        let _ = self
          .jsonProvider
          .jsonRelations
          .handleRelations(doc, &rels)
          .await;
      }
    }

    Ok(successResponse(DataValue::Array(docs)))
  }

  async fn handleGet(
    &self,
    table: String,
    id: Option<String>,
    relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    // Determine which provider to use
    let providerType = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let idStr = id.ok_or_else(|| errResponse("ID required for get"))?;

    let repo = self.routedRepository.forTable(table.clone());

    let mut doc = repo
      .get(&idStr, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Get failed", &e))?;

    // Use new load parameter with RelationLoader if provided
    if let Some(loadPaths) = load {
      if !loadPaths.is_empty() {
        // Reset stats before loading
        match providerType {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              let _ = mongo.relationLoader.resetStats().await;
            }
          }
          _ => {
            let _ = self.jsonProvider.relationLoader.resetStats().await;
          }
        }

        let result = match providerType {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              mongo
                .relationLoader
                .loadRelations(&mut doc, &table, &loadPaths)
                .await
            } else {
              Err("MongoDB provider not available".into())
            }
          }
          _ => {
            self
              .jsonProvider
              .relationLoader
              .loadRelations(&mut doc, &table, &loadPaths)
              .await
          }
        };

        // Propagate relation-loading errors so the caller knows data is incomplete (M-11)
        if let Err(e) = result {
          return Err(errResponseFormatted(
            "Failed to load relations",
            &e.to_string(),
          ));
        }

        // Clear cache after request is complete
        match providerType {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              let _ = mongo.relationLoader.clearCache().await;
            }
          }
          _ => {
            let _ = self.jsonProvider.relationLoader.clearCache().await;
          }
        }
      }
    } else if let Some(rels) = relations {
      // Fallback to old RelationObj approach for backward compatibility
      let _ = self
        .jsonProvider
        .jsonRelations
        .handleRelations(&mut doc, &rels)
        .await;
    }

    Ok(successResponse(DataValue::Object(doc)))
  }

  async fn handleCreate(
    &self,
    table: String,
    data: Option<Value>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let dataVal = data.ok_or_else(|| errResponse("Data required for create"))?;

    if table == "profiles" {
      return self.createProfileWithUserUpdate(dataVal).await;
    }

    let validatedData = validateModel(&table, &dataVal, true)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let repo = self.routedRepository.forTable(table.clone());

    let createdRecord = repo
      .create(validatedData.clone(), syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Create failed", &e))?;

    self
      .activityMonitor
      .logAction(&table, "create", &createdRecord, None)
      .await;
    Ok(successResponse(DataValue::Object(createdRecord)))
  }

  async fn handleUpdate(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for update"))?;
    let dataVal = data.ok_or_else(|| errResponse("Data required for update"))?;

    let repo = self.routedRepository.forTable(table.clone());

    let original = repo
      .get(&idStr, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Fetch original failed", &e))?;

    let validatedData = validateModel(&table, &dataVal, false)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let updatedRecord = repo
      .update(&idStr, validatedData.clone(), syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Update failed", &e))?;

    self
      .activityMonitor
      .logAction(&table, "update", &updatedRecord, Some(&original))
      .await;
    Ok(successResponse(DataValue::Object(updatedRecord)))
  }

  async fn handleUpdateAll(
    &self,
    table: String,
    data: Option<Value>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let dataVal = data.ok_or_else(|| errResponse("Data required for updateAll"))?;

    // dataVal should be an array for updateAll
    let rawRecords = dataVal
      .as_array()
      .ok_or_else(|| errResponse("Data must be an array for updateAll"))?
      .clone();

    // Validate each record before writing (M-6)
    let mut validatedRecords: Vec<Value> = Vec::with_capacity(rawRecords.len());
    for record in rawRecords {
      let validated = validateModel(&table, &record, false)
        .map_err(|e| errResponseFormatted("Validation failed in updateAll", &e))?;
      validatedRecords.push(validated);
    }

    let repo = self.routedRepository.forTable(table.clone());

    repo
      .updateAll(validatedRecords.clone(), syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Update all failed", &e))?;

    // Return the updated records so frontend can update storage
    Ok(successResponse(DataValue::Array(validatedRecords)))
  }

  async fn handleDelete(
    &self,
    table: String,
    id: Option<String>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for delete"))?;

    let providerType = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let repo = self.routedRepository.forTable(table.clone());

    let original = repo
      .get(&idStr, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Fetch original failed", &e))?;

    repo
      .delete(&idStr, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Delete failed", &e))?;

    // Handle cascade delete.
    // For Mongo mode, cascade both providers so the local JSON cache stays consistent (H-9).
    match providerType {
      ProviderType::Mongo => {
        self
          .cascadeService
          .handleMongoCascade(&table, &idStr, false)
          .await?;
        // Best-effort JSON cascade — keep local cache in sync; ignore errors
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
      .logAction(&table, "delete", &original, None)
      .await;
    Ok(successResponse(DataValue::String(idStr)))
  }

  async fn handleRestore(
    &self,
    table: String,
    id: Option<String>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let idStr = id.ok_or_else(|| errResponse("ID required for restore"))?;

    let providerType = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
    let updateData = json!({ "isDeleted": false, "updatedAt": timestamp });

    let repo = self.routedRepository.forTable(table.clone());

    repo
      .update(&idStr, updateData, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Restore failed", &e))?;

    // Handle cascade restore, routing by provider type (mirrors handleDelete)
    match providerType {
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
    let profileId = validatedProfile
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if userId.is_empty() || profileId.is_empty() {
      return Err(errResponse("Invalid profile data"));
    }

    // Local-first: save to JSON so profile works offline / when MongoDB is unavailable
    self
      .jsonProvider
      .jsonCrud
      .create("profiles", validatedProfile.clone())
      .await
      .map_err(|e| errResponseFormatted("Error creating profile in local store", &e.to_string()))?;

    // Update current user's profileId in local JSON (required for app to see profile)
    user_sync_helper::updateUserProfileId(
      &self.jsonProvider,
      &self.mongodbProvider,
      &userId,
      &profileId,
    )
    .await?;

    // Best-effort sync to cloud: only this user's profile + user record. Safe for other users.
    if let Some(ref mongodb) = self.mongodbProvider {
      // IMPORTANT: When MongoDB is down, `create()` may block for a long driver timeout.
      // Keep profile creation fast by enforcing a short timeout here.
      let create_result = tokio::time::timeout(
        std::time::Duration::from_millis(800),
        mongodb
          .mongodbCrud
          .create("profiles", validatedProfile.clone()),
      )
      .await;

      match create_result {
        Ok(Ok(_created)) => {
          // ok
        }
        Ok(Err(e)) => {
          tracing::warn!(
            "Profile sync to cloud skipped (will sync when online): {}",
            e
          );
        }
        Err(_elapsed) => {
          tracing::warn!("Profile sync to cloud skipped (will sync when online): MongoDB timeout");
        }
      }
      // updateUserProfileId above already tried to update user in Mongo (best-effort)
    }

    self
      .activityMonitor
      .logAction("profiles", "create", &validatedProfile, None)
      .await;
    Ok(successResponse(DataValue::Object(validatedProfile)))
  }
}
