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
    let provider_type = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let repo = self.routedRepository.for_table(table.clone());

    let mut docs = repo
      .getAll(filter, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Get all failed", &e))?;

    // Use NEW batch loading with RelationLoader if load parameter is provided
    if let Some(load_paths) = load {
      if !load_paths.is_empty() {
        // Reset stats before batch loading
        match provider_type {
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
        let batch_result = match provider_type {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              mongo
                .relationLoader
                .loadRelationsBatch(&mut docs, &table, &load_paths)
                .await
            } else {
              Err("MongoDB provider not available".into())
            }
          }
          _ => {
            self
              .jsonProvider
              .relationLoader
              .loadRelationsBatch(&mut docs, &table, &load_paths)
              .await
          }
        };

        let _ = batch_result;

        // Clear cache after request is complete
        match provider_type {
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
    let provider_type = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let id_str = id.ok_or_else(|| errResponse("ID required for get"))?;

    let repo = self.routedRepository.for_table(table.clone());

    let mut doc = repo
      .get(&id_str, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Get failed", &e))?;

    // Use new load parameter with RelationLoader if provided
    if let Some(load_paths) = load {
      if !load_paths.is_empty() {
        // Reset stats before loading
        match provider_type {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              let _ = mongo.relationLoader.resetStats().await;
            }
          }
          _ => {
            let _ = self.jsonProvider.relationLoader.resetStats().await;
          }
        }

        let result = match provider_type {
          ProviderType::Mongo => {
            if let Some(ref mongo) = self.mongodbProvider {
              mongo
                .relationLoader
                .loadRelations(&mut doc, &table, &load_paths)
                .await
            } else {
              Err("MongoDB provider not available".into())
            }
          }
          _ => {
            self
              .jsonProvider
              .relationLoader
              .loadRelations(&mut doc, &table, &load_paths)
              .await
          }
        };

        let _ = result;

        // Clear cache after request is complete
        match provider_type {
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
    let data_val = data.ok_or_else(|| errResponse("Data required for create"))?;

    if table == "profiles" {
      return self.createProfileWithUserUpdate(data_val).await;
    }

    let validated_data = validateModel(&table, &data_val, true)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let repo = self.routedRepository.for_table(table.clone());

    let created_record = repo
      .create(validated_data.clone(), syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Create failed", &e))?;

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
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for update"))?;
    let data_val = data.ok_or_else(|| errResponse("Data required for update"))?;

    let repo = self.routedRepository.for_table(table.clone());

    let original = repo
      .get(&id_str, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Fetch original failed", &e))?;

    let validated_data = validateModel(&table, &data_val, false)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let updated_record = repo
      .update(&id_str, validated_data.clone(), syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Update failed", &e))?;

    self
      .activityMonitor
      .logAction(&table, "update", &updated_record, Some(&original))
      .await;
    Ok(successResponse(DataValue::Object(updated_record)))
  }

  async fn handleUpdateAll(
    &self,
    table: String,
    data: Option<Value>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| errResponse("Data required for updateAll"))?;

    // data_val should be an array for updateAll
    let records = data_val
      .as_array()
      .ok_or_else(|| errResponse("Data must be an array for updateAll"))?
      .clone();

    let repo = self.routedRepository.for_table(table.clone());

    repo
      .updateAll(records.clone(), syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Update all failed", &e))?;

    // Return the updated records so frontend can update storage
    Ok(successResponse(DataValue::Array(records)))
  }

  async fn handleDelete(
    &self,
    table: String,
    id: Option<String>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for delete"))?;

    let provider_type = if let Some(ref metadata) = syncMetadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let repo = self.routedRepository.for_table(table.clone());

    let original = repo
      .get(&id_str, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Fetch original failed", &e))?;

    repo
      .delete(&id_str, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Delete failed", &e))?;

    // Handle cascade delete, routing by provider type
    match provider_type {
      ProviderType::Mongo => {
        self
          .cascadeService
          .handleMongoCascade(&table, &id_str, false)
          .await?;
      }
      _ => {
        self
          .cascadeService
          .handleJsonCascade(&table, &id_str, false)
          .await?;
      }
    }

    self
      .activityMonitor
      .logAction(&table, "delete", &original, None)
      .await;
    Ok(successResponse(DataValue::String(id_str)))
  }

  async fn handleRestore(
    &self,
    table: String,
    id: Option<String>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for restore"))?;
    let update_data = json!({ "isDeleted": false });

    let repo = self.routedRepository.for_table(table.clone());

    repo
      .update(&id_str, update_data, syncMetadata.as_ref())
      .await
      .map_err(|e| errResponseFormatted("Restore failed", &e))?;

    // Handle cascade restore
    self
      .cascadeService
      .handleJsonCascade(&table, &id_str, true)
      .await?;

    Ok(successResponse(DataValue::String(id_str)))
  }

  async fn createProfileWithUserUpdate(
    &self,
    profileData: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    let validatedProfile = validateModel("profiles", &profileData, true)
      .map_err(|e| errResponseFormatted("Profile validation failed", &e))?;

    self
      .jsonProvider
      .jsonCrud
      .create("profiles", validatedProfile.clone())
      .await
      .map_err(|e| errResponseFormatted("Error creating profile", &e.to_string()))?;

    let userId = validatedProfile
      .get("userId")
      .and_then(|v| v.as_str())
      .unwrap_or_default();
    let profileId = validatedProfile
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default();

    if userId.is_empty() || profileId.is_empty() {
      return Err(errResponse("Invalid profile data"));
    }

    user_sync_helper::updateUserProfileId(
      &self.jsonProvider,
      &self.mongodbProvider,
      userId,
      profileId,
    )
    .await?;

    if let Some(ref mongodb) = self.mongodbProvider {
      mongodb
        .mongodbCrud
        .create("profiles", validatedProfile.clone())
        .await
        .map_err(|e| errResponseFormatted("Mongo create failed", &e.to_string()))?;
    }

    self
      .activityMonitor
      .logAction("profiles", "create", &validatedProfile, None)
      .await;
    Ok(successResponse(DataValue::Object(validatedProfile)))
  }
}
