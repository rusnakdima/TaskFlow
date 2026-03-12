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
  table_model::validateModel,
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
use crate::services::cascade::CascadeService;
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
    println!("[CrudService] execute: {} on {} (id={:?})", operation, table, id);
    let use_json = self.determineProvider(&syncMetadata)?;
    println!("[CrudService] Using JSON provider: {}", use_json);
    
    let effective_rels = relations.or_else(|| relation_definitions::getTableRelations(&table));

    match operation.as_str() {
      "getAll" => self.handleGetAll(table, filter, effective_rels, use_json).await,
      "get" => self.handleGet(table, id, effective_rels, use_json).await,
      "create" => self.handleCreate(table, data, use_json).await,
      "update" => self.handleUpdate(table, id, data, use_json).await,
      "updateAll" => self.handleUpdateAll(table, data, use_json).await,
      "delete" => self.handleDelete(table, id, use_json).await,
      "restore" => self.handleRestore(table, id, use_json).await,
      _ => {
        println!("[CrudService] Unknown operation: {}", operation);
        Err(errResponse(&format!("Unknown operation: {}", operation)))
      },
    }
  }

  fn determineProvider(&self, syncMetadata: &Option<SyncMetadata>) -> Result<bool, ResponseModel> {
    if let Some(ref metadata) = syncMetadata {
      match getProviderType(metadata) {
        Ok(provider_type) => match provider_type {
          crate::models::provider_type_model::ProviderType::Json => Ok(true),
          crate::models::provider_type_model::ProviderType::Mongo => Ok(false),
        },
        Err(e) => Err(e),
      }
    } else {
      Ok(true)
    }
  }

  async fn handleGetAll(
    &self,
    table: String,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut docs = if use_json {
      self.jsonProvider.jsonCrud.getAll(&table, filter).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.getAll(&table, filter).await
    }
    .map_err(|e| errResponseFormatted("Get all failed", &e.to_string()))?;

    if let Some(rels) = relations {
      for doc in &mut docs {
        let _ = self.jsonProvider.jsonRelations.handleRelations(doc, &rels).await;
      }
    }

    Ok(successResponse(DataValue::Array(docs)))
  }

  async fn handleGet(
    &self,
    table: String,
    id: Option<String>,
    relations: Option<Vec<RelationObj>>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for get"))?;

    let mut doc = if use_json {
      self.jsonProvider.jsonCrud.get(&table, &id_str).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.get(&table, &id_str).await
    }
    .map_err(|e| errResponseFormatted("Get failed", &e.to_string()))?;

    if let Some(rels) = relations {
      let _ = self.jsonProvider.jsonRelations.handleRelations(&mut doc, &rels).await;
    }

    Ok(successResponse(DataValue::Object(doc)))
  }

  async fn handleCreate(
    &self,
    table: String,
    data: Option<Value>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| errResponse("Data required for create"))?;
    println!("[CrudService] handleCreate: table={}, data={}", table, data_val);

    if table == "profiles" {
      return self.createProfileWithUserUpdate(data_val).await;
    }

    // Validate and convert model (generates _id, id, timestamps, etc.)
    let validated_data = validateModel(&table, &data_val, true)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;
    println!("[CrudService] handleCreate: validated_data={}", validated_data);

    let result = if use_json {
      println!("[CrudService] Calling jsonProvider.create");
      self.jsonProvider.jsonCrud.create(&table, validated_data.clone()).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      println!("[CrudService] Calling mongodbProvider.create");
      mongodb.mongodbCrud.create(&table, validated_data.clone()).await
    };

    match result {
      Ok(created_record) => {
        println!("[CrudService] Create successful in DB, returning created record");
        self.activityMonitor.logAction(&table, "create", &created_record, None).await;
        Ok(successResponse(DataValue::Object(created_record)))
      },
      Err(e) => {
        println!("[CrudService] Create failed in DB: {}", e);
        Err(errResponseFormatted("Create failed", &e.to_string()))
      }
    }
  }

  async fn handleUpdate(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for update"))?;
    let data_val = data.ok_or_else(|| errResponse("Data required for update"))?;
    println!("[CrudService] handleUpdate: table={}, id={}, data={}", table, id_str, data_val);

    let original = if use_json {
      self.jsonProvider.jsonCrud.get(&table, &id_str).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.get(&table, &id_str).await
    }
    .map_err(|e| {
      println!("[CrudService] Fetch original failed: {}", e);
      errResponseFormatted("Fetch original failed", &e.to_string())
    })?;

    // Validate and convert model (for updates, isCreate=false)
    let validated_data = validateModel(&table, &data_val, false)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;
    println!("[CrudService] handleUpdate: validated_data={}", validated_data);

    let result = if use_json {
      println!("[CrudService] Calling jsonProvider.update");
      self.jsonProvider.jsonCrud.update(&table, &id_str, validated_data.clone()).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      println!("[CrudService] Calling mongodbProvider.update");
      mongodb.mongodbCrud.update(&table, &id_str, validated_data.clone()).await
    };

    match result {
      Ok(updated_record) => {
        println!("[CrudService] Update successful in DB, returning updated record");
        self.activityMonitor.logAction(&table, "update", &updated_record, Some(&original)).await;
        Ok(successResponse(DataValue::Object(updated_record)))
      },
      Err(e) => {
        println!("[CrudService] Update failed in DB: {}", e);
        Err(errResponseFormatted("Update failed", &e.to_string()))
      }
    }
  }

  async fn handleUpdateAll(
    &self,
    table: String,
    data: Option<Value>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| errResponse("Data required for updateAll"))?;

    // data_val should be an array for updateAll
    let records = data_val.as_array()
      .ok_or_else(|| errResponse("Data must be an array for updateAll"))?
      .clone();

    if use_json {
      self.jsonProvider.updateAll(&table, records.clone()).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.updateAll(&table, records.clone()).await
    }
    .map_err(|e| errResponseFormatted("Update all failed", &e.to_string()))?;

    // Return the updated records so frontend can update storage
    Ok(successResponse(DataValue::Array(records)))
  }

  async fn handleDelete(
    &self,
    table: String,
    id: Option<String>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for delete"))?;

    let original = if use_json {
      self.jsonProvider.jsonCrud.get(&table, &id_str).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.get(&table, &id_str).await
    }
    .map_err(|e| errResponseFormatted("Fetch original failed", &e.to_string()))?;

    if use_json {
      self.jsonProvider.jsonCrud.delete(&table, &id_str).await?;
      self.cascadeService.handleJsonCascade(&table, &id_str, false).await?;
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.delete(&table, &id_str).await?;
      self.cascadeService.handleMongoCascade(&table, &id_str, false).await?;
    }

    self.activityMonitor.logAction(&table, "delete", &original, None).await;
    Ok(successResponse(DataValue::String(id_str)))
  }

  async fn handleRestore(
    &self,
    table: String,
    id: Option<String>,
    use_json: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for restore"))?;
    let update_data = json!({ "isDeleted": false });

    if use_json {
      self.jsonProvider.jsonCrud.update(&table, &id_str, update_data.clone()).await
    } else {
      let mongodb = self.mongodbProvider.as_ref()
        .ok_or_else(|| errResponseFormatted("MongoDB not available", ""))?;
      mongodb.mongodbCrud.update(&table, &id_str, update_data.clone()).await
    }
    .map_err(|e| errResponseFormatted("Restore failed", &e.to_string()))?;

    if use_json {
      self.cascadeService.handleJsonCascade(&table, &id_str, true).await?;
    } else {
      self.cascadeService.handleMongoCascade(&table, &id_str, true).await?;
    }

    Ok(successResponse(DataValue::String(id_str)))
  }

  async fn createProfileWithUserUpdate(
    &self,
    profileData: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    // Validate and convert profile model (generates _id, id, timestamps)
    let validatedProfile = validateModel("profiles", &profileData, true)
      .map_err(|e| errResponseFormatted("Profile validation failed", &e))?;
    println!("[CrudService] createProfileWithUserUpdate: validatedProfile={}", validatedProfile);

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
