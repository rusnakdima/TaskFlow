/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  relation_obj::RelationObj,
  response_model::{DataValue, ResponseModel},
  sync_metadata_model::SyncMetadata,
};

/* helpers */
use crate::helpers::user_sync_helper;
use crate::helpers::{
  common::getProviderType,
  response_helper::{errResponse, errResponseFormatted, successResponse},
};

/* services */
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::admin::relation_definitions;
use crate::services::cascade_service::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

#[derive(Clone)]
pub struct CrudService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub cascadeService: CascadeService,
  pub entityResolution: Arc<EntityResolutionService>,
  pub activityMonitor: ActivityMonitorService,
}

impl CrudService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
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

  /// Orchestrate CRUD operations with provider type selection based on SyncMetadata
  /// - Private + Owner = JSON provider (local storage)
  /// - Team (!Private) OR !Owner = MongoDB provider (cloud storage)
  pub async fn execute(
    &self,
    operation: String,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    // Determine which provider to use based on syncMetadata
    let useJsonProvider = if let Some(ref metadata) = syncMetadata {
      match getProviderType(metadata) {
        Ok(provider_type) => match provider_type {
          crate::models::provider_type_model::ProviderType::Json => true,
          crate::models::provider_type_model::ProviderType::Mongo => false,
        },
        Err(e) => return Err(e),
      }
    } else {
      // Default to JSON provider if no syncMetadata provided (backward compatibility)
      true
    };

    // Auto-resolve relations if not provided
    let effective_rels = match relations {
      Some(rels) => Some(rels),
      None => relation_definitions::getTableRelations(&table),
    };

    match operation.as_str() {
      "getAll" => {
        // Get data from appropriate provider
        let mut docs = if useJsonProvider {
          self.jsonProvider.jsonCrud.getAll(&table, filter).await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider.mongodbCrud.getAll(&table, filter).await
        }
        .map_err(|e| errResponseFormatted("Get all failed", &e.to_string()))?;

        // Apply relations if provided
        if let Some(rels) = effective_rels {
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
      "get" => {
        let id_str = id.ok_or_else(|| errResponse("ID required for get"))?;

        // Get data from appropriate provider
        let mut doc = if useJsonProvider {
          self.jsonProvider.jsonCrud.get(&table, &id_str).await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider.mongodbCrud.get(&table, &id_str).await
        }
        .map_err(|e| errResponseFormatted("Get failed", &e.to_string()))?;

        // Apply relations if provided
        if let Some(rels) = effective_rels {
          let _ = self
            .jsonProvider
            .jsonRelations
            .handleRelations(&mut doc, &rels)
            .await;
        }

        Ok(successResponse(DataValue::Object(doc)))
      }
      "create" => {
        let data_val = data.ok_or_else(|| errResponse("Data required for create"))?;
        if table == "profiles" {
          return self.createProfileWithUserUpdate(data_val).await;
        }

        // Create in appropriate provider
        if useJsonProvider {
          self
            .jsonProvider
            .jsonCrud
            .create(&table, data_val.clone())
            .await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider
            .mongodbCrud
            .create(&table, data_val.clone())
            .await
        }
        .map_err(|e| errResponseFormatted("Create failed", &e.to_string()))?;

        self
          .activityMonitor
          .logAction(&table, "create", &data_val, None)
          .await;
        Ok(successResponse(DataValue::Object(data_val)))
      }
      "update" => {
        let id_str = id.ok_or_else(|| errResponse("ID required for update"))?;
        let data_val = data.ok_or_else(|| errResponse("Data required for update"))?;

        // Get original from appropriate provider
        let original = if useJsonProvider {
          self.jsonProvider.jsonCrud.get(&table, &id_str).await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider.mongodbCrud.get(&table, &id_str).await
        }
        .map_err(|e| errResponseFormatted("Fetch original failed", &e.to_string()))?;

        // Update in appropriate provider
        if useJsonProvider {
          self
            .jsonProvider
            .jsonCrud
            .update(&table, &id_str, data_val.clone())
            .await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider
            .mongodbCrud
            .update(&table, &id_str, data_val.clone())
            .await
        }
        .map_err(|e| errResponseFormatted("Update failed", &e.to_string()))?;

        self
          .activityMonitor
          .logAction(&table, "update", &data_val, Some(&original))
          .await;
        Ok(successResponse(DataValue::Object(data_val)))
      }
      "delete" => {
        let id_str = id.ok_or_else(|| errResponse("ID required for delete"))?;

        // Get original from appropriate provider
        let original = if useJsonProvider {
          self.jsonProvider.jsonCrud.get(&table, &id_str).await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider.mongodbCrud.get(&table, &id_str).await
        }
        .map_err(|e| errResponseFormatted("Fetch original failed", &e.to_string()))?;

        // Delete from appropriate provider
        if useJsonProvider {
          self.jsonProvider.jsonCrud.delete(&table, &id_str).await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider.mongodbCrud.delete(&table, &id_str).await
        }
        .map_err(|e| errResponseFormatted("Delete failed", &e.to_string()))?;

        self
          .cascadeService
          .handleJsonCascade(&table, &id_str, false)
          .await?;
        self
          .activityMonitor
          .logAction(&table, "delete", &original, None)
          .await;

        Ok(successResponse(DataValue::String(id_str)))
      }
      "restore" => {
        let id_str = id.ok_or_else(|| errResponse("ID required for restore"))?;
        let update_data = json!({ "isDeleted": false });

        // Update in appropriate provider
        if useJsonProvider {
          self
            .jsonProvider
            .jsonCrud
            .update(&table, &id_str, update_data)
            .await
        } else {
          let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| {
            errResponseFormatted(
              "MongoDB provider not available",
              &"MongoDB is not initialized",
            )
          })?;
          mongodbProvider
            .mongodbCrud
            .update(&table, &id_str, update_data)
            .await
        }
        .map_err(|e| errResponseFormatted("Restore failed", &e.to_string()))?;

        self
          .cascadeService
          .handleJsonCascade(&table, &id_str, true)
          .await?;
        Ok(successResponse(DataValue::String(id_str)))
      }
      _ => Err(errResponse("Invalid operation")),
    }
  }

  async fn createProfileWithUserUpdate(
    &self,
    profileData: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .jsonProvider
      .jsonCrud
      .create("profiles", profileData.clone())
      .await
      .map_err(|e| errResponseFormatted("Error creating profile", &e.to_string()))?;

    let userId = profileData
      .get("userId")
      .and_then(|v| v.as_str())
      .unwrap_or_default();
    let profileId = profileData
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
        .create("profiles", profileData.clone())
        .await
        .map_err(|e| errResponseFormatted("Mongo create failed", &e.to_string()))?;
    }

    self
      .activityMonitor
      .logAction("profiles", "create", &profileData, None)
      .await;
    Ok(successResponse(DataValue::Object(profileData)))
  }
}
