/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cache::QueryCache;
use nosql_orm::cdc::ChangeCapture;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::{Filter, Projection};
use nosql_orm::relations::RelationLoader;

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  relation_config::{user_projection, RelationConfig},
  relation_obj::RelationObj,
  response_entity::{DataValue, ResponseModel},
  sync_metadata_entity::SyncMetadata,
  table_entity::validateModel,
};

/* helpers */
use crate::helpers::{
  common::getProviderType,
  filter_helper::FilterBuilder,
  projection_helper::ProjectionHelper,
  response_helper::{errResponse, errResponseFormatted, successResponse},
  user_sync_helper,
};

/* services */
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::cascade::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

pub struct RepositoryService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub cascadeService: CascadeService,
  pub entityResolution: Arc<EntityResolutionService>,
  pub activityMonitor: ActivityMonitorService,
  pub queryCache: Option<Arc<QueryCache>>,
  pub cdcService: Option<Arc<dyn ChangeCapture>>,
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
      queryCache: None,
      cdcService: None,
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    self.queryCache = Some(Arc::new(cache));
    self
  }

  pub fn with_cdc<C: ChangeCapture + 'static>(mut self, cdc: Arc<C>) -> Self {
    self.cdcService = Some(cdc as Arc<dyn ChangeCapture>);
    self
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

  fn build_filter(&self, filter_value: &Value) -> Option<Filter> {
    FilterBuilder::from_json(filter_value)
  }

  async fn load_relations_json(
    &self,
    mut docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() {
      return Ok(docs);
    }

    let loader = RelationLoader::new(self.jsonProvider.clone());
    let proj = user_projection();

    for path in load_paths {
      let parts: Vec<&str> = path.split('.').collect();

      if parts.len() >= 3 {
        docs = self
          .load_deep_nested_relation(docs, table, &parts, &loader, &proj)
          .await?;
        continue;
      }

      if RelationConfig::is_nested_path(path) {
        if let Some((base, nested)) = RelationConfig::split_nested_path(path) {
          docs = self
            .load_nested_relation(docs, table, base, nested, &loader, &proj)
            .await?;
        }
        continue;
      }

      if let Some(relation_def) = RelationConfig::get_relation_def(table, path) {
        let needs_proj = RelationConfig::needs_user_projection(table, path);
        docs = loader
          .load_many(docs, &relation_def, true)
          .await
          .map_err(|e| errResponseFormatted("Relation load failed", &e.to_string()))?;
        if needs_proj {
          docs = self.apply_projection_to_relations(docs, path, &proj);
        }
      }
    }

    Ok(docs)
  }

  async fn load_deep_nested_relation(
    &self,
    mut docs: Vec<Value>,
    table: &str,
    parts: &[&str],
    loader: &RelationLoader<JsonProvider>,
    proj: &Projection,
  ) -> Result<Vec<Value>, ResponseModel> {
    if parts.len() < 3 {
      return Ok(docs);
    }

    let base = parts[0];
    let nested1 = parts[1];
    let nested2 = parts[2];

    for doc in docs.iter_mut() {
      if let Some(obj) = doc.as_object_mut() {
        if let Some(relation_arr) = obj.get(base).and_then(|v| v.as_array()) {
          let mut items: Vec<Value> = relation_arr.clone();

          let nested1_def = RelationConfig::get_nested_relation(table, base, nested1);
          if let Some(def) = nested1_def {
            items = loader
              .load_many(items, &def, true)
              .await
              .map_err(|e| errResponseFormatted("Nested1 load failed", &e.to_string()))?;
          }

          if nested1 == "subtasks" || nested1 == "tasks" {
            for item in items.iter_mut() {
              if let Some(obj) = item.as_object_mut() {
                if let Some(nested1_arr) = obj.get_mut(nested1).and_then(|v| v.as_array_mut()) {
                  for subtask in nested1_arr.iter_mut() {
                    if let Some(subtask_obj) = subtask.as_object_mut() {
                      let nested2_def =
                        RelationConfig::get_nested_relation(nested1, nested1, nested2);
                      if let Some(def) = nested2_def {
                        let subtask_id =
                          subtask_obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        if !subtask_id.is_empty() {
                          let filter = nosql_orm::query::Filter::Eq(
                            "subtaskId".to_string(),
                            serde_json::json!(subtask_id),
                          );
                          let loaded: Vec<Value> = self
                            .jsonProvider
                            .find_many(
                              &def.target_collection,
                              Some(&filter),
                              None,
                              None,
                              None,
                              true,
                            )
                            .await
                            .map_err(|e| {
                              errResponseFormatted("Nested2 load failed", &e.to_string())
                            })?;
                          let projected: Vec<Value> =
                            loaded.into_iter().map(|v| proj.apply(&v)).collect();
                          subtask_obj.insert("comments".to_string(), Value::Array(projected));
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          obj.insert(base.to_string(), Value::Array(items));
        }
      }
    }

    Ok(docs)
  }

  fn apply_projection_to_relations(
    &self,
    mut docs: Vec<Value>,
    path: &str,
    proj: &Projection,
  ) -> Vec<Value> {
    for doc in docs.iter_mut() {
      if let Some(obj) = doc.as_object_mut() {
        if let Some(rel_doc) = obj.get(path) {
          let projected = proj.apply(rel_doc);
          obj.insert(path.to_string(), projected);
        }
      }
    }
    docs
  }

  async fn load_nested_relation(
    &self,
    mut docs: Vec<Value>,
    table: &str,
    base: &str,
    nested: &str,
    loader: &RelationLoader<JsonProvider>,
    proj: &Projection,
  ) -> Result<Vec<Value>, ResponseModel> {
    if let Some(nested_def) = RelationConfig::get_nested_relation(table, base, nested) {
      let needs_proj = RelationConfig::nested_needs_projection(table, base, nested);
      for doc in docs.iter_mut() {
        if let Some(obj) = doc.as_object_mut() {
          if let Some(relation_arr) = obj.get(base).and_then(|v| v.as_array()) {
            let mut items: Vec<Value> = relation_arr.clone();
            items = loader
              .load_many(items, &nested_def, true)
              .await
              .map_err(|e| errResponseFormatted("Nested relation load failed", &e.to_string()))?;
            if needs_proj {
              items = self.apply_projection_to_array(items, nested, proj);
            }
            obj.insert(base.to_string(), Value::Array(items));
          }
        }
      }
    }
    Ok(docs)
  }

  fn apply_projection_to_array(
    &self,
    mut items: Vec<Value>,
    nested_path: &str,
    proj: &Projection,
  ) -> Vec<Value> {
    for item in items.iter_mut() {
      if let Some(obj) = item.as_object_mut() {
        match nested_path {
          "subtasks" | "comments" => {
            if let Some(nested) = obj.get_mut(nested_path) {
              if let Some(arr) = nested.as_array() {
                let projected: Vec<Value> = arr.iter().map(|v| proj.apply(v)).collect();
                *nested = Value::Array(projected);
              }
            }
          }
          _ => {
            if let Some(nested) = obj.get_mut(nested_path) {
              let projected = proj.apply(nested);
              *nested = projected;
            }
          }
        }
      }
    }
    items
  }

  fn apply_frontend_projection(&self, doc: Value, _table: &str) -> Value {
    ProjectionHelper::apply_frontend_projection(&doc)
  }

  fn apply_projection_to_docs(&self, docs: Vec<Value>, _table: &str) -> Vec<Value> {
    ProjectionHelper::apply_to_docs(&docs)
  }

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
          .handle_get_all(table, filter, relations, load, sync_metadata)
          .await
      }
      "get" => {
        self
          .handle_get(table, id, relations, load, sync_metadata)
          .await
      }
      "create" => self.handle_create(table, data, sync_metadata).await,
      "update" => self.handle_update(table, id, data, sync_metadata).await,
      "updateAll" => self.handle_update_all(table, data, sync_metadata).await,
      "delete" => self.handle_delete(table, id, sync_metadata, false).await,
      "permanent-delete" => {
        self
          .handle_permanent_delete_cascade(table, id, sync_metadata)
          .await
      }
      "soft-delete-cascade" => {
        self
          .handle_soft_delete_cascade(table, id, sync_metadata)
          .await
      }
      "restore-cascade" => self.handle_restore_cascade(table, id, sync_metadata).await,
      "sync-to-provider" => {
        let target = if let Some(ref metadata) = sync_metadata {
          getProviderType(metadata).unwrap_or(ProviderType::Json)
        } else {
          ProviderType::Json
        };
        let id_str = id.ok_or_else(|| errResponse("ID required for sync"))?;
        self
          .handle_sync_to_provider(table, id_str, target, sync_metadata)
          .await
      }
      "restore" => self.handle_restore(table, id, sync_metadata).await,
      _ => Err(errResponse(&format!("Unknown operation: {}", operation))),
    }
  }

  async fn handle_get_all(
    &self,
    table: String,
    filter: Option<Value>,
    _relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let orm_filter = filter.as_ref().and_then(|f| self.build_filter(f));

    let cache_key = self.queryCache.as_ref().map(|cache| {
      let filter_json = filter
        .as_ref()
        .map(|f| serde_json::to_string(f).unwrap_or_default());
      cache.cache_key(&table, filter_json.as_deref(), None, None, None)
    });

    if let (Some(ref cache), Some(ref key)) = (&self.queryCache, &cache_key) {
      if let Ok(Some(cached_docs)) = cache.get::<Vec<Value>>(key).await {
        tracing::debug!("Cache hit for query: {}", key);
        let mut docs = cached_docs;
        if let Some(ref load_paths) = load {
          docs = self.load_relations_json(docs, &table, load_paths).await?;
        }
        docs = self.apply_projection_to_docs(docs, &table);
        return Ok(successResponse(DataValue::Array(docs)));
      }
    }

    let mut docs = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .find_many(&table, orm_filter.as_ref(), None, None, None, true)
        .await
        .map_err(|e| errResponseFormatted("Get all failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .find_many(&table, orm_filter.as_ref(), None, None, None, true)
        .await
        .map_err(|e| errResponseFormatted("Get all failed", &e.to_string()))?
    } else {
      Vec::new()
    };

    if let (Some(ref cache), Some(ref key)) = (&self.queryCache, &cache_key) {
      if !docs.is_empty() {
        let _ = cache.set(key.clone(), &docs).await;
        tracing::debug!("Cached query result: {}", key);
      }
    }

    if let Some(ref load_paths) = load {
      docs = self.load_relations_json(docs, &table, load_paths).await?;
    }

    docs = self.apply_projection_to_docs(docs, &table);

    Ok(successResponse(DataValue::Array(docs)))
  }

  async fn handle_get(
    &self,
    table: String,
    id: Option<String>,
    _relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for get"))?;

    let doc = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .find_by_id(&table, &id_str)
        .await
        .map_err(|e| errResponseFormatted("Get failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .find_by_id(&table, &id_str)
        .await
        .map_err(|e| errResponseFormatted("Get failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    match doc {
      Some(d) => {
        let mut entity_with_relations = if let Some(ref load_paths) = load {
          let entities = vec![d.clone()];
          match self.load_relations_json(entities, &table, load_paths).await {
            Ok(loaded) => loaded.into_iter().next().unwrap_or(d),
            Err(_) => d,
          }
        } else {
          d
        };
        entity_with_relations = self.apply_frontend_projection(entity_with_relations, &table);
        Ok(successResponse(DataValue::Object(entity_with_relations)))
      }
      None => Err(errResponse(&format!("{} not found", id_str))),
    }
  }

  async fn handle_create(
    &self,
    table: String,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| errResponse("Data required for create"))?;

    eprintln!(
      "[RepositoryService] handle_create table={} sync_metadata={:?}",
      table, sync_metadata
    );

    if table == "profiles" {
      return self.create_profile_with_user_update(data_val).await;
    }

    let validated_data = validateModel(&table, &data_val, true)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    let validated_data = self.strip_relation_fields(&table, validated_data);

    let is_team_entity = sync_metadata
      .as_ref()
      .map(|m| !m.isPrivate && m.isOwner)
      .unwrap_or(false);

    eprintln!(
      "[RepositoryService] is_team_entity={} use_json={}",
      is_team_entity,
      self.use_json_provider(sync_metadata.as_ref())
    );

    let created_record = if self.use_json_provider(sync_metadata.as_ref()) {
      eprintln!("[RepositoryService] INSERTING INTO JSON provider");
      self
        .jsonProvider
        .insert(&table, validated_data.clone())
        .await
        .map_err(|e| errResponseFormatted("Create failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      eprintln!("[RepositoryService] INSERTING INTO MONGODB provider");
      mongo
        .insert(&table, validated_data.clone())
        .await
        .map_err(|e| errResponseFormatted("Create failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    // Team entities ONLY go to MongoDB, private entities ONLY go to JSON
    // No dual-write - CDC captures changes for audit purposes

    if let Some(ref cache) = self.queryCache {
      let _ = cache.invalidate_collection(&table).await;
    }

    if let Some(ref cdc) = self.cdcService {
      let change = nosql_orm::cdc::Change::insert(
        &table,
        created_record
          .get("id")
          .and_then(|v| v.as_str())
          .unwrap_or(""),
        created_record.clone(),
      );
      let _ = cdc.capture(change).await;
    }

    self
      .activityMonitor
      .logAction(&table, "create", &created_record, None)
      .await;

    let response_doc = self.apply_frontend_projection(created_record, &table);
    Ok(successResponse(DataValue::Object(response_doc)))
  }

  async fn handle_update(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    _sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("Data required for update"))?;
    let data_val = data.ok_or_else(|| errResponse("Data required for update"))?;

    let data_val = self.strip_relation_fields(&table, data_val);

    let validated_data = validateModel(&table, &data_val, false)
      .map_err(|e| errResponseFormatted("Validation failed", &e))?;

    // Find where the entity currently exists (check both providers)
    let (updated_record, was_in_json) = match self.jsonProvider.find_by_id(&table, &id_str).await {
      Ok(Some(record)) => {
        // Record exists in JSON - update there
        let updated = self
          .jsonProvider
          .update(&table, &id_str, validated_data.clone())
          .await
          .map_err(|e| errResponseFormatted("Update failed in JSON", &e.to_string()))?;
        (updated, true)
      }
      _ => {
        if let Some(ref mongo) = self.mongodbProvider {
          match mongo.find_by_id(&table, &id_str).await {
            Ok(Some(record)) => {
              let updated = mongo
                .update(&table, &id_str, validated_data.clone())
                .await
                .map_err(|e| errResponseFormatted("Update failed in MongoDB", &e.to_string()))?;
              (updated, false)
            }
            _ => {
              return Err(errResponseFormatted(
                "Record not found",
                &format!("{}/{}", table, id_str),
              ));
            }
          }
        } else {
          return Err(errResponse("Record not found and no MongoDB available"));
        }
      }
    };

    // Get the new visibility from the data if it was changed
    let new_visibility = validated_data.get("visibility").and_then(|v| v.as_str());
    if let Some(new_vis) = new_visibility {
      // Visibility changed - sync to the OTHER provider
      let target_is_json = new_vis == "private";
      if target_is_json != was_in_json {
        // Need visibility sync to target provider
        let source = if was_in_json {
          ProviderType::Json
        } else {
          ProviderType::Mongo
        };
        let target = if target_is_json {
          ProviderType::Json
        } else {
          ProviderType::Mongo
        };
        let _ = self
          .handle_sync_visibility_to_provider(id_str.clone(), source, target)
          .await;
      }
    }

    if let Some(ref cache) = self.queryCache {
      let _ = cache.invalidate_collection(&table).await;
    }

    if let Some(ref cdc) = self.cdcService {
      let change = nosql_orm::cdc::Change::update(
        &table,
        &id_str,
        serde_json::json!({}),
        updated_record.clone(),
      );
      let _ = cdc.capture(change).await;
    }

    self
      .activityMonitor
      .logAction(&table, "update", &updated_record, None)
      .await;

    let response_doc = self.apply_frontend_projection(updated_record, &table);
    Ok(successResponse(DataValue::Object(response_doc)))
  }

  async fn handle_update_all(
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
      let stripped = self.strip_relation_fields(&table, record);
      let validated = validateModel(&table, &stripped, false)
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

    let projected_records = self.apply_projection_to_docs(validated_records, &table);
    Ok(successResponse(DataValue::Array(projected_records)))
  }

  async fn handle_delete(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
    is_permanent: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for delete"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    if is_permanent {
      match provider_type {
        ProviderType::Mongo => {
          if let Some(ref mongo) = self.mongodbProvider {
            let _ = mongo
              .delete(&table, &id_str)
              .await
              .map_err(|e| errResponseFormatted("Delete failed", &e.to_string()))?;
          }
          self
            .cascadeService
            .permanent_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
        _ => {
          let _ = self
            .jsonProvider
            .delete(&table, &id_str)
            .await
            .map_err(|e| errResponseFormatted("Delete failed", &e.to_string()))?;
          self
            .cascadeService
            .permanent_delete_cascade_json(&table, &id_str)
            .await?;
        }
      }
    } else {
      match provider_type {
        ProviderType::Mongo => {
          self
            .cascadeService
            .soft_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
        _ => {
          self
            .cascadeService
            .soft_delete_cascade_json(&table, &id_str)
            .await?;
        }
      }
    }

    if let Some(ref cache) = self.queryCache {
      let _ = cache.invalidate_collection(&table).await;
    }

    if let Some(ref cdc) = self.cdcService {
      let change =
        nosql_orm::cdc::Change::delete(&table, &id_str, serde_json::json!({"id": id_str.clone()}));
      let _ = cdc.capture(change).await;
    }

    self
      .activityMonitor
      .logAction(&table, "delete", &json!({"id": id_str.clone()}), None)
      .await;
    Ok(successResponse(DataValue::String(id_str)))
  }

  async fn handle_soft_delete_cascade(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    self.handle_delete(table, id, sync_metadata, false).await
  }

  async fn handle_permanent_delete_cascade(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    self.handle_delete(table, id, sync_metadata, true).await
  }

  async fn handle_restore_cascade(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for restore"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    match provider_type {
      ProviderType::Mongo => {
        self
          .cascadeService
          .restore_cascade_mongo(&table, &id_str)
          .await?;
      }
      _ => {
        self
          .cascadeService
          .restore_cascade_json(&table, &id_str)
          .await?;
      }
    }

    Ok(successResponse(DataValue::String(id_str)))
  }

  async fn handle_sync_to_provider(
    &self,
    table: String,
    id: String,
    target_provider: ProviderType,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    match target_provider {
      ProviderType::Mongo => {
        self
          .cascadeService
          .sync_entity_to_mongo(&table, &id)
          .await?;
      }
      _ => {
        self.cascadeService.sync_entity_to_json(&table, &id).await?;
      }
    }

    Ok(successResponse(DataValue::String(id)))
  }

  pub async fn handle_sync_visibility_to_provider(
    &self,
    todo_id: String,
    source_provider: ProviderType,
    target_provider: ProviderType,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut synced_count = 0;
    let new_visibility = if target_provider == ProviderType::Mongo {
      "team"
    } else {
      "private"
    };

    eprintln!("[RepositoryService] handle_sync_visibility todo_id={} source={:?} target={:?} new_visibility={}",
        todo_id, source_provider, target_provider, new_visibility);
    eprintln!(
      "[RepositoryService] mongodbProvider.is_some()={}",
      self.mongodbProvider.is_some()
    );

    if source_provider == ProviderType::Json {
      eprintln!("[RepositoryService] SOURCE=JSON - reading from JSON and syncing to MongoDB");
      let todos = self
        .jsonProvider
        .find_many("todos", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let tasks = self
        .jsonProvider
        .find_many("tasks", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let subtasks = self
        .jsonProvider
        .find_many("subtasks", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let comments = self
        .jsonProvider
        .find_many("comments", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let chats = self
        .jsonProvider
        .find_many("chats", None, None, None, None, false)
        .await
        .unwrap_or_default();

      eprintln!(
        "[RepositoryService] Found todos={} tasks={} subtasks={} comments={} chats={}",
        todos.len(),
        tasks.len(),
        subtasks.len(),
        comments.len(),
        chats.len()
      );

      for todo in todos
        .iter()
        .filter(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = todo.get("id").and_then(|v| v.as_str()) {
          let mut updated = todo.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
          }
          if let Some(ref mongo) = self.mongodbProvider {
            let existing = mongo.find_by_id("todos", id).await.ok().flatten();
            let existing_time = existing.as_ref().and_then(|e| {
              e.get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            });
            let entity_time = updated
              .get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
            let should_sync = existing_time
              .map(|e| match entity_time {
                Some(n) if n > e => true,
                None => true,
                _ => false,
              })
              .unwrap_or(true);

            if should_sync {
              if existing.is_some() {
                let _ = mongo.patch("todos", id, updated.clone()).await;
              } else {
                let _ = mongo.insert("todos", updated.clone()).await;
              }
              // Mark as deleted in JSON (source) and ensure active in Mongo (target)
              let now = chrono::Utc::now().to_rfc3339();
              let _ = self
                .jsonProvider
                .patch(
                  "todos",
                  id,
                  serde_json::json!({
                    "visibility": new_visibility,
                    "deleted_at": now
                  }),
                )
                .await;
              let _ = mongo
                .patch(
                  "todos",
                  id,
                  serde_json::json!({ "deleted_at": serde_json::Value::Null }),
                )
                .await;
              synced_count += 1;
            }
          }
        }
      }

      for task in tasks
        .iter()
        .filter(|t| t.get("todoId").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = task.get("id").and_then(|v| v.as_str()) {
          if let Some(ref mongo) = self.mongodbProvider {
            eprintln!("[RepositoryService] Syncing task id={}", id);
            let existing = mongo.find_by_id("tasks", id).await.ok().flatten();
            eprintln!(
              "[RepositoryService] Task exists in MongoDB: {}",
              existing.is_some()
            );
            let existing_time = existing.as_ref().and_then(|e| {
              e.get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            });
            let entity_time = task
              .get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
            let should_sync = existing_time
              .map(|e| match entity_time {
                Some(n) if n > e => true,
                None => true,
                _ => false,
              })
              .unwrap_or(true);

            if should_sync {
              eprintln!(
                "[RepositoryService] Should sync={} existing.is_some()={}",
                should_sync,
                existing.is_some()
              );
              if existing.is_some() {
                eprintln!("[RepositoryService] PATCHING task to MongoDB");
                let mut patch_with_visibility = task.clone();
                if let Some(obj) = patch_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let result = mongo.patch("tasks", id, patch_with_visibility).await;
                eprintln!("[RepositoryService] PATCH result: {:?}", result);
              } else {
                eprintln!("[RepositoryService] INSERTING task to MongoDB");
                let mut task_with_todo = task.clone();
                if let Some(obj) = task_with_todo.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let result = mongo.insert("tasks", task_with_todo).await;
                eprintln!("[RepositoryService] INSERT result: {:?}", result);
              }
              // Mark as deleted in JSON (source)
              let now = chrono::Utc::now().to_rfc3339();
              let _ = self
                .jsonProvider
                .patch(
                  "tasks",
                  id,
                  serde_json::json!({
                    "visibility": new_visibility,
                    "deleted_at": now
                  }),
                )
                .await;
              synced_count += 1;
            }
          }
        }
      }

      for subtask in subtasks.iter() {
        let is_child = tasks.iter().any(|t| {
          t.get("id") == subtask.get("taskId")
            && t.get("todoId").and_then(|v| v.as_str()) == Some(&todo_id)
        });
        if is_child {
          if let Some(id) = subtask.get("id").and_then(|v| v.as_str()) {
            if let Some(ref mongo) = self.mongodbProvider {
              let existing = mongo.find_by_id("subtasks", id).await.ok().flatten();
              let existing_time = existing.as_ref().and_then(|e| {
                e.get("updated_at")
                  .and_then(|v| v.as_str())
                  .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
              });
              let entity_time = subtask
                .get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
              let should_sync = existing_time
                .map(|e| match entity_time {
                  Some(n) if n > e => true,
                  None => true,
                  _ => false,
                })
                .unwrap_or(true);

              if should_sync {
                if existing.is_some() {
                  let mut patch_with_visibility = subtask.clone();
                  if let Some(obj) = patch_with_visibility.as_object_mut() {
                    obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                    obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                  }
                  let _ = mongo.patch("subtasks", id, patch_with_visibility).await;
                } else {
                  let mut subtask_with_visibility = subtask.clone();
                  if let Some(obj) = subtask_with_visibility.as_object_mut() {
                    obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                    obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                  }
                  let _ = mongo.insert("subtasks", subtask_with_visibility).await;
                }
                // Mark as deleted in JSON (source)
                let now = chrono::Utc::now().to_rfc3339();
                let _ = self
                  .jsonProvider
                  .patch(
                    "subtasks",
                    id,
                    serde_json::json!({
                      "visibility": new_visibility,
                      "deleted_at": now
                    }),
                  )
                  .await;
                synced_count += 1;
              }
            }
          }
        }
      }

      for comment in comments.iter() {
        let comment_task_id = comment.get("taskId").and_then(|v| v.as_str());
        let comment_subtask_id = comment.get("subtaskId").and_then(|v| v.as_str());
        let is_child = tasks
          .iter()
          .any(|t| t.get("id").and_then(|v| v.as_str()) == comment_task_id)
          || subtasks
            .iter()
            .any(|s| s.get("id").and_then(|v| v.as_str()) == comment_subtask_id);
        if is_child {
          if let Some(id) = comment.get("id").and_then(|v| v.as_str()) {
            if let Some(ref mongo) = self.mongodbProvider {
              let existing = mongo.find_by_id("comments", id).await.ok().flatten();
              let existing_time = existing.as_ref().and_then(|e| {
                e.get("updated_at")
                  .and_then(|v| v.as_str())
                  .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
              });
              let entity_time = comment
                .get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
              let should_sync = existing_time
                .map(|e| match entity_time {
                  Some(n) if n > e => true,
                  None => true,
                  _ => false,
                })
                .unwrap_or(true);

              if should_sync {
                if existing.is_some() {
                  let mut patch_with_visibility = comment.clone();
                  if let Some(obj) = patch_with_visibility.as_object_mut() {
                    obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                    obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                  }
                  let _ = mongo.patch("comments", id, patch_with_visibility).await;
                } else {
                  let mut comment_with_visibility = comment.clone();
                  if let Some(obj) = comment_with_visibility.as_object_mut() {
                    obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                    obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                  }
                  let _ = mongo.insert("comments", comment_with_visibility).await;
                }
                // Mark as deleted in JSON (source)
                let now = chrono::Utc::now().to_rfc3339();
                let _ = self
                  .jsonProvider
                  .patch(
                    "comments",
                    id,
                    serde_json::json!({
                      "visibility": new_visibility,
                      "deleted_at": now
                    }),
                  )
                  .await;
                synced_count += 1;
              }
            }
          }
        }
      }

      for chat in chats
        .iter()
        .filter(|c| c.get("todoId").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = chat.get("id").and_then(|v| v.as_str()) {
          if let Some(ref mongo) = self.mongodbProvider {
            let existing = mongo.find_by_id("chats", id).await.ok().flatten();
            let existing_time = existing.as_ref().and_then(|e| {
              e.get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            });
            let entity_time = chat
              .get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
            let should_sync = existing_time
              .map(|e| match entity_time {
                Some(n) if n > e => true,
                None => true,
                _ => false,
              })
              .unwrap_or(true);

            if should_sync {
              if existing.is_some() {
                let mut patch_with_visibility = chat.clone();
                if let Some(obj) = patch_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let _ = mongo.patch("chats", id, patch_with_visibility).await;
              } else {
                let mut chat_with_visibility = chat.clone();
                if let Some(obj) = chat_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let _ = mongo.insert("chats", chat_with_visibility).await;
              }
              // Mark as deleted in JSON (source)
              let now = chrono::Utc::now().to_rfc3339();
              let _ = self
                .jsonProvider
                .patch(
                  "chats",
                  id,
                  serde_json::json!({
                    "visibility": new_visibility,
                    "deleted_at": now
                  }),
                )
                .await;
              synced_count += 1;
            }
          }
        }
      }
    } else if let Some(ref mongo) = self.mongodbProvider {
      let todos = mongo
        .find_many("todos", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let tasks = mongo
        .find_many("tasks", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let subtasks = mongo
        .find_many("subtasks", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let comments = mongo
        .find_many("comments", None, None, None, None, false)
        .await
        .unwrap_or_default();
      let chats = mongo
        .find_many("chats", None, None, None, None, false)
        .await
        .unwrap_or_default();

      for todo in todos
        .iter()
        .filter(|t| t.get("id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = todo.get("id").and_then(|v| v.as_str()) {
          let mut updated = todo.clone();
          if let Some(obj) = updated.as_object_mut() {
            obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
          }
          let existing = self
            .jsonProvider
            .find_by_id("todos", id)
            .await
            .ok()
            .flatten();
          let existing_time = existing.as_ref().and_then(|e| {
            e.get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
          });
          let entity_time = updated
            .get("updated_at")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
          let should_sync = existing_time
            .map(|e| match entity_time {
              Some(n) if n > e => true,
              None => true,
              _ => false,
            })
            .unwrap_or(true);

          if should_sync {
            if existing.is_some() {
              let _ = self.jsonProvider.patch("todos", id, updated.clone()).await;
            } else {
              let _ = self.jsonProvider.insert("todos", updated.clone()).await;
            }
            // Mark as deleted in MongoDB (source) and ensure active in JSON (target)
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "todos",
                id,
                serde_json::json!({
                  "visibility": new_visibility,
                  "deleted_at": now
                }),
              )
              .await;
            let _ = self
              .jsonProvider
              .patch(
                "todos",
                id,
                serde_json::json!({ "deleted_at": serde_json::Value::Null }),
              )
              .await;
            synced_count += 1;
          }
        }
      }

      for task in tasks
        .iter()
        .filter(|t| t.get("todoId").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = task.get("id").and_then(|v| v.as_str()) {
          let existing = self
            .jsonProvider
            .find_by_id("tasks", id)
            .await
            .ok()
            .flatten();
          let existing_time = existing.as_ref().and_then(|e| {
            e.get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
          });
          let entity_time = task
            .get("updated_at")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
          let should_sync = existing_time
            .map(|e| match entity_time {
              Some(n) if n > e => true,
              None => true,
              _ => false,
            })
            .unwrap_or(true);

          if should_sync {
            if existing.is_some() {
              let mut patch_with_visibility = task.clone();
              if let Some(obj) = patch_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .jsonProvider
                .patch("tasks", id, patch_with_visibility)
                .await;
            } else {
              let mut task_with_visibility = task.clone();
              if let Some(obj) = task_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .jsonProvider
                .insert("tasks", task_with_visibility)
                .await;
            }
            // Mark as deleted in MongoDB (source)
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "tasks",
                id,
                serde_json::json!({
                  "visibility": new_visibility,
                  "deleted_at": now
                }),
              )
              .await;
            synced_count += 1;
          }
        }
      }

      for subtask in subtasks.iter() {
        let is_child = tasks.iter().any(|t| {
          t.get("id") == subtask.get("taskId")
            && t.get("todoId").and_then(|v| v.as_str()) == Some(&todo_id)
        });
        if is_child {
          if let Some(id) = subtask.get("id").and_then(|v| v.as_str()) {
            let existing = self
              .jsonProvider
              .find_by_id("subtasks", id)
              .await
              .ok()
              .flatten();
            let existing_time = existing.as_ref().and_then(|e| {
              e.get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            });
            let entity_time = subtask
              .get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
            let should_sync = existing_time
              .map(|e| match entity_time {
                Some(n) if n > e => true,
                None => true,
                _ => false,
              })
              .unwrap_or(true);

            if should_sync {
              if existing.is_some() {
                let mut patch_with_visibility = subtask.clone();
                if let Some(obj) = patch_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let _ = self
                  .jsonProvider
                  .patch("subtasks", id, patch_with_visibility)
                  .await;
              } else {
                let mut subtask_with_visibility = subtask.clone();
                if let Some(obj) = subtask_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let _ = self
                  .jsonProvider
                  .insert("subtasks", subtask_with_visibility)
                  .await;
              }
              // Mark as deleted in MongoDB (source)
              let now = chrono::Utc::now().to_rfc3339();
              let _ = mongo
                .patch(
                  "subtasks",
                  id,
                  serde_json::json!({
                    "visibility": new_visibility,
                    "deleted_at": now
                  }),
                )
                .await;
              synced_count += 1;
            }
          }
        }
      }

      for comment in comments.iter() {
        let comment_task_id = comment.get("taskId").and_then(|v| v.as_str());
        let comment_subtask_id = comment.get("subtaskId").and_then(|v| v.as_str());
        let is_child = tasks
          .iter()
          .any(|t| t.get("id").and_then(|v| v.as_str()) == comment_task_id)
          || subtasks
            .iter()
            .any(|s| s.get("id").and_then(|v| v.as_str()) == comment_subtask_id);
        if is_child {
          if let Some(id) = comment.get("id").and_then(|v| v.as_str()) {
            let existing = self
              .jsonProvider
              .find_by_id("comments", id)
              .await
              .ok()
              .flatten();
            let existing_time = existing.as_ref().and_then(|e| {
              e.get("updated_at")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            });
            let entity_time = comment
              .get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
            let should_sync = existing_time
              .map(|e| match entity_time {
                Some(n) if n > e => true,
                None => true,
                _ => false,
              })
              .unwrap_or(true);

            if should_sync {
              if existing.is_some() {
                let mut patch_with_visibility = comment.clone();
                if let Some(obj) = patch_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let _ = self
                  .jsonProvider
                  .patch("comments", id, patch_with_visibility)
                  .await;
              } else {
                let mut comment_with_visibility = comment.clone();
                if let Some(obj) = comment_with_visibility.as_object_mut() {
                  obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                  obj.insert("deleted_at".to_string(), serde_json::Value::Null);
                }
                let _ = self
                  .jsonProvider
                  .insert("comments", comment_with_visibility)
                  .await;
              }
              // Mark as deleted in MongoDB (source)
              let now = chrono::Utc::now().to_rfc3339();
              let _ = mongo
                .patch(
                  "comments",
                  id,
                  serde_json::json!({
                    "visibility": new_visibility,
                    "deleted_at": now
                  }),
                )
                .await;
              synced_count += 1;
            }
          }
        }
      }

      for chat in chats
        .iter()
        .filter(|c| c.get("todoId").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = chat.get("id").and_then(|v| v.as_str()) {
          let existing = self
            .jsonProvider
            .find_by_id("chats", id)
            .await
            .ok()
            .flatten();
          let existing_time = existing.as_ref().and_then(|e| {
            e.get("updated_at")
              .and_then(|v| v.as_str())
              .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
          });
          let entity_time = chat
            .get("updated_at")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
          let should_sync = existing_time
            .map(|e| match entity_time {
              Some(n) if n > e => true,
              None => true,
              _ => false,
            })
            .unwrap_or(true);

          if should_sync {
            if existing.is_some() {
              let mut patch_with_visibility = chat.clone();
              if let Some(obj) = patch_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .jsonProvider
                .patch("chats", id, patch_with_visibility)
                .await;
            } else {
              let mut chat_with_visibility = chat.clone();
              if let Some(obj) = chat_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .jsonProvider
                .insert("chats", chat_with_visibility)
                .await;
            }
            // Mark as deleted in MongoDB (source)
            let now = chrono::Utc::now().to_rfc3339();
            let _ = mongo
              .patch(
                "chats",
                id,
                serde_json::json!({
                  "visibility": new_visibility,
                  "deleted_at": now
                }),
              )
              .await;
            synced_count += 1;
          }
        }
      }
    }

    Ok(successResponse(DataValue::Number(synced_count as f64)))
  }

  async fn handle_restore(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| errResponse("ID required for restore"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      getProviderType(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let patch = json!({ "deleted_at": serde_json::Value::Null });

    let _ = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .jsonProvider
        .patch(&table, &id_str, patch)
        .await
        .map_err(|e| errResponseFormatted("Restore failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodbProvider {
      mongo
        .patch(&table, &id_str, patch)
        .await
        .map_err(|e| errResponseFormatted("Restore failed", &e.to_string()))?
    } else {
      return Err(errResponse("No provider available"));
    };

    match provider_type {
      ProviderType::Mongo => {
        self
          .cascadeService
          .handleMongoCascade(&table, &id_str, true)
          .await?;
      }
      _ => {
        self
          .cascadeService
          .handleJsonCascade(&table, &id_str, true)
          .await?;
      }
    }

    Ok(successResponse(DataValue::String(id_str)))
  }

  fn strip_relation_fields(&self, table: &str, mut data: Value) -> Value {
    if let Some(obj) = data.as_object_mut() {
      match table {
        "todos" => {
          obj.remove("tasks");
          obj.remove("subtasks");
          obj.remove("comments");
          obj.remove("assigneesProfiles");
          obj.remove("user");
          obj.remove("categories");
        }
        "tasks" => {
          obj.remove("subtasks");
          obj.remove("comments");
          obj.remove("todo");
        }
        "subtasks" => {
          obj.remove("task");
          obj.remove("comments");
        }
        "comments" => {
          obj.remove("task");
          obj.remove("subtask");
        }
        "users" => {
          obj.remove("profile");
        }
        "profiles" => {
          obj.remove("user");
        }
        _ => {}
      }
    }
    data
  }

  async fn create_profile_with_user_update(
    &self,
    profile_data: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    let validated_profile = validateModel("profiles", &profile_data, true)
      .map_err(|e| errResponseFormatted("Profile validation failed", &e))?;

    let user_id = validated_profile
      .get("userId")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if user_id.is_empty() {
      return Err(errResponse("Invalid profile data: userId is required"));
    }

    if let Ok(existing_profiles) = self.jsonProvider.find_all("profiles").await {
      for profile in existing_profiles {
        if profile.get("userId").and_then(|v| v.as_str()) == Some(&user_id) {
          return Ok(successResponse(DataValue::Object(profile)));
        }
      }
    }

    let created_profile = self
      .jsonProvider
      .insert("profiles", validated_profile.clone())
      .await
      .map_err(|e| errResponseFormatted("Error creating profile in local store", &e.to_string()))?;

    let profile_id = created_profile
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();
    user_sync_helper::updateUserProfileIdJson(&self.jsonProvider, &user_id, &profile_id).await?;

    self
      .activityMonitor
      .logAction("profiles", "create", &created_profile, None)
      .await;
    Ok(successResponse(DataValue::Object(created_profile)))
  }
}
