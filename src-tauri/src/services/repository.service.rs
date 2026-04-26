/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cache::QueryCache;
use nosql_orm::cdc::ChangeCapture;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;
use nosql_orm::relations::{get_relation_def, RelationLoader};

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  relation_config::{user_projection, RelationConfig},
  relation_obj::RelationObj,
  response_entity::{DataValue, ResponseModel},
  sync_metadata_entity::SyncMetadata,
  table_entity::validate_model,
};

/* helpers */
use crate::helpers::{
  common::get_provider_type,
  response_helper::{err_response, err_response_formatted, success_response},
};

/* services */
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::cascade::{CascadeService, VisibilitySyncService};
use crate::services::entity_resolution_service::EntityResolutionService;
use crate::services::profile_service::ProfileService;

pub struct RepositoryService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub cascade_service: CascadeService,
  pub entity_resolution: Arc<EntityResolutionService>,
  pub activity_monitor: ActivityMonitorService,
  pub profile_service: ProfileService,
  pub query_cache: Option<Arc<QueryCache>>,
  pub cdc_service: Option<Arc<dyn ChangeCapture>>,
}

impl RepositoryService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    cascade_service: CascadeService,
    entity_resolution: Arc<EntityResolutionService>,
    activity_monitor: ActivityMonitorService,
    profile_service: ProfileService,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      cascade_service,
      entity_resolution,
      activity_monitor,
      profile_service,
      query_cache: None,
      cdc_service: None,
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    self.query_cache = Some(Arc::new(cache));
    self
  }

  pub fn with_cdc<C: ChangeCapture + 'static>(mut self, cdc: Arc<C>) -> Self {
    self.cdc_service = Some(cdc as Arc<dyn ChangeCapture>);
    self
  }

  fn use_json_provider(&self, sync_metadata: Option<&SyncMetadata>) -> bool {
    if self.mongodb_provider.is_none() {
      return true;
    }
    if let Some(metadata) = sync_metadata {
      match get_provider_type(metadata) {
        Ok(ProviderType::Json) => true,
        Ok(ProviderType::Mongo) => false,
        Err(_) => true,
      }
    } else {
      true
    }
  }

  fn build_filter(&self, filter_value: &Value) -> Option<Filter> {
    Filter::from_json(filter_value).ok()
  }

  async fn load_relations_via_nosql_orm(
    &self,
    docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
    use_mongo: bool,
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() || docs.is_empty() {
      return Ok(docs);
    }

    async fn load<P: DatabaseProvider + Clone>(
      repo: &RepositoryService,
      provider: P,
      docs: Vec<Value>,
      load_paths: &[String],
      table: &str,
      collection_adder: impl Fn(Vec<Value>, &str) -> Vec<Value>,
    ) -> Result<Vec<Value>, ResponseModel> {
      let loader = RelationLoader::new(provider);
      let mut result_docs = docs;
      tracing::debug!(
        "[REPO] Loading relations: table={}, paths={:?}",
        table,
        load_paths
      );
      for path in load_paths {
        // Add collection metadata before loading relations
        result_docs = collection_adder(result_docs, table);
        let segments: Vec<&str> = path.split('.').collect();
        match loader.load_nested(result_docs, &segments, true).await {
          Ok(loaded) => result_docs = loaded,
          Err(e) => {
            tracing::warn!(
              "[REPO] Failed to load relations for table={}, path={}: {}",
              table,
              path,
              e
            );
            return Err(err_response_formatted(
              "Relation loading failed",
              &e.to_string(),
            ));
          }
        }
      }
      Ok(result_docs)
    }

    if use_mongo {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("No MongoDB provider available"))?;
      load(
        self,
        mongo.as_ref().clone(),
        docs,
        load_paths,
        table,
        |docs, collection| self.add_collection_metadata(docs, collection),
      )
      .await
    } else {
      load(
        self,
        self.json_provider.clone(),
        docs,
        load_paths,
        table,
        |docs, collection| self.add_collection_metadata(docs, collection),
      )
      .await
    }
  }

  fn apply_projection_recursive(&self, docs: Vec<Value>) -> Vec<Value> {
    let projection = user_projection();
    docs
      .into_iter()
      .map(|doc| projection.apply_recursive(&doc))
      .collect()
  }

  fn add_collection_metadata(&self, mut docs: Vec<Value>, collection: &str) -> Vec<Value> {
    for doc in &mut docs {
      if let Some(obj) = doc.as_object_mut() {
        if !obj.contains_key("_collection") {
          obj.insert(
            "_collection".to_string(),
            Value::String(collection.to_string()),
          );
        }
      }
    }
    docs
  }

  fn add_collection_metadata_to_relations(
    &self,
    docs: &mut [Value],
    source_collection: &str,
    loaded_path: &str,
  ) {
    let segments: Vec<&str> = loaded_path.split('.').collect();
    if segments.is_empty() {
      return;
    }

    let mut current_collection = source_collection.to_string();
    for &segment in &segments[..segments.len() - 1] {
      if let Some(rel_def) = get_relation_def(current_collection.as_str(), segment) {
        current_collection = rel_def.target_collection.clone();
      } else {
        return;
      }
    }

    let target_relation = segments.last().unwrap();
    if let Some(rel_def) = get_relation_def(current_collection.as_str(), target_relation) {
      let target_coll = rel_def.target_collection.as_str();
      self.add_metadata_at_path(docs, &segments, target_coll);
    }
  }

  fn add_metadata_at_path(&self, docs: &mut [Value], path_segments: &[&str], target_coll: &str) {
    if path_segments.is_empty() {
      for doc in docs.iter_mut() {
        if let Some(obj) = doc.as_object_mut() {
          obj.insert(
            "_collection".to_string(),
            Value::String(target_coll.to_string()),
          );
        }
      }
    } else {
      let field = path_segments[0];
      for doc in docs.iter_mut() {
        if let Some(obj) = doc.as_object_mut() {
          if let Some(field_val) = obj.get_mut(field) {
            if let Some(arr) = field_val.as_array_mut() {
              let mut items = arr.clone();
              self.add_metadata_at_path(&mut items, &path_segments[1..], target_coll);
              *arr = items;
            }
          }
        }
      }
    }
  }

  async fn capture_change(&self, operation: &str, table: &str, id: &str, data: Value) {
    if let Some(ref cdc) = self.cdc_service {
      let change = match operation {
        "insert" => nosql_orm::cdc::Change::insert(table, id, data),
        "update" => nosql_orm::cdc::Change::update(table, id, json!({}), data),
        "delete" => nosql_orm::cdc::Change::delete(table, id, data),
        _ => return,
      };
      let _ = cdc.capture(change).await;
    }
  }

  async fn invalidate_cache(&self, table: &str) {
    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(table).await;
    }
  }

  #[allow(clippy::too_many_arguments)]
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
          get_provider_type(metadata).unwrap_or(ProviderType::Json)
        } else {
          ProviderType::Json
        };
        let id_str = id.ok_or_else(|| err_response("ID required for sync"))?;
        self
          .handle_sync_to_provider(table, id_str, target, sync_metadata)
          .await
      }
      "restore" => self.handle_restore(table, id, sync_metadata).await,
      _ => Err(err_response(&format!("Unknown operation: {}", operation))),
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
    let use_mongo = !self.use_json_provider(sync_metadata.as_ref());

    let cache_key = self.query_cache.as_ref().map(|cache| {
      let filter_json = filter
        .as_ref()
        .map(|f| serde_json::to_string(f).unwrap_or_default());
      cache.cache_key(&table, filter_json.as_deref(), None, None, None)
    });

    if let (Some(ref cache), Some(ref key)) = (&self.query_cache, &cache_key) {
      if let Ok(Some(mut docs)) = cache.get::<Vec<Value>>(key).await {
        let load_paths = load.as_ref().map(|l| l.clone()).unwrap_or_else(Vec::new);
        if !load_paths.is_empty() {
          docs = self
            .load_relations_via_nosql_orm(docs, &table, &load_paths, use_mongo)
            .await?;
        }
        return Ok(success_response(DataValue::Array(
          self.apply_projection_recursive(docs),
        )));
      }
    }

    let mut docs = if use_mongo {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("No MongoDB provider available"))?;
      mongo
        .find_many(&table, orm_filter.as_ref(), None, None, None, true)
        .await
    } else {
      self
        .json_provider
        .find_many(&table, orm_filter.as_ref(), None, None, None, true)
        .await
    }
    .map_err(|e| err_response_formatted("Get all failed", &e.to_string()))?;

    if let (Some(ref cache), Some(ref key)) = (&self.query_cache, &cache_key) {
      if !docs.is_empty() {
        let _ = cache.set(key.clone(), &docs).await;
      }
    }

    let load_paths = load.as_ref().map(|l| l.clone()).unwrap_or_else(Vec::new);
    if !load_paths.is_empty() {
      docs = self
        .load_relations_via_nosql_orm(docs, &table, &load_paths, use_mongo)
        .await?;
    }

    Ok(success_response(DataValue::Array(
      self.apply_projection_recursive(docs),
    )))
  }

  async fn handle_get(
    &self,
    table: String,
    id: Option<String>,
    _relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("ID required for get"))?;
    let use_mongo = !self.use_json_provider(sync_metadata.as_ref());

    let doc = if use_mongo {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("No MongoDB provider available"))?;
      mongo.find_by_id(&table, &id_str).await
    } else {
      self.json_provider.find_by_id(&table, &id_str).await
    }
    .map_err(|e| err_response_formatted("Get failed", &e.to_string()))?;

    match doc {
      Some(d) => {
        let mut docs = vec![d];
        let load_paths = load.as_ref().map(|l| l.clone()).unwrap_or_else(Vec::new);
        if !load_paths.is_empty() {
          docs = self
            .load_relations_via_nosql_orm(docs, &table, &load_paths, use_mongo)
            .await?;
        }

        let response_doc = self
          .apply_projection_recursive(docs)
          .into_iter()
          .next()
          .unwrap();
        Ok(success_response(DataValue::Object(response_doc)))
      }
      None => Err(err_response(&format!("{} not found", id_str))),
    }
  }

  async fn handle_create(
    &self,
    table: String,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| err_response("Data required for create"))?;

    eprintln!(
      "[RepositoryService] handle_create table={} sync_metadata={:?}",
      table, sync_metadata
    );

    if table == "profiles" {
      return self
        .profile_service
        .create_profile_with_user_update(data_val)
        .await;
    }

    let validated_data = validate_model(&table, &data_val, true)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let validated_data =
      RelationConfig::get_relation_exclusion_projection(&table).apply_recursive(&validated_data);

    let is_team_entity = sync_metadata
      .as_ref()
      .map(|m| !m.is_private && m.is_owner)
      .unwrap_or(false);

    eprintln!(
      "[RepositoryService] is_team_entity={} use_json={}",
      is_team_entity,
      self.use_json_provider(sync_metadata.as_ref())
    );

    let created_record = if self.use_json_provider(sync_metadata.as_ref()) {
      eprintln!("[RepositoryService] INSERTING INTO JSON provider");
      self
        .json_provider
        .insert(&table, validated_data.clone())
        .await
        .map_err(|e| err_response_formatted("Create failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodb_provider {
      eprintln!("[RepositoryService] INSERTING INTO MONGODB provider");
      mongo
        .insert(&table, validated_data.clone())
        .await
        .map_err(|e| err_response_formatted("Create failed", &e.to_string()))?
    } else {
      return Err(err_response("No provider available"));
    };

    // Team entities ONLY go to MongoDB, private entities ONLY go to JSON
    // No dual-write - CDC captures changes for audit purposes

    self.invalidate_cache(&table).await;

    let id = created_record
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    self
      .capture_change("insert", &table, id, created_record.clone())
      .await;

    self
      .activity_monitor
      .log_action(&table, "create", &created_record, None)
      .await;

    let response_doc = user_projection().apply_recursive(&created_record);
    Ok(success_response(DataValue::Object(response_doc)))
  }

  async fn handle_update(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    _sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("Data required for update"))?;
    let data_val = data.ok_or_else(|| err_response("Data required for update"))?;

    let data_val =
      RelationConfig::get_relation_exclusion_projection(&table).apply_recursive(&data_val);

    let validated_data = validate_model(&table, &data_val, false)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    // Find where the entity currently exists (check both providers)
    let (updated_record, was_in_json) = match self.json_provider.find_by_id(&table, &id_str).await {
      Ok(Some(_record)) => {
        // Record exists in JSON - update there
        let updated = self
          .json_provider
          .update(&table, &id_str, validated_data.clone())
          .await
          .map_err(|e| err_response_formatted("Update failed in JSON", &e.to_string()))?;
        (updated, true)
      }
      _ => {
        if let Some(ref mongo) = self.mongodb_provider {
          match mongo.find_by_id(&table, &id_str).await {
            Ok(Some(_record)) => {
              let updated = mongo
                .update(&table, &id_str, validated_data.clone())
                .await
                .map_err(|e| err_response_formatted("Update failed in MongoDB", &e.to_string()))?;
              (updated, false)
            }
            _ => {
              return Err(err_response_formatted(
                "Record not found",
                &format!("{}/{}", table, id_str),
              ));
            }
          }
        } else {
          return Err(err_response("Record not found and no MongoDB available"));
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
        let _ = VisibilitySyncService::sync_todo_visibility(
          &self.json_provider,
          self.mongodb_provider.as_ref(),
          id_str.clone(),
          source,
          target,
        )
        .await;
      }
    }

    self.invalidate_cache(&table).await;
    self
      .capture_change("update", &table, &id_str, updated_record.clone())
      .await;

    self
      .activity_monitor
      .log_action(&table, "update", &updated_record, None)
      .await;

    let response_doc = user_projection().apply_recursive(&updated_record);
    Ok(success_response(DataValue::Object(response_doc)))
  }

  async fn handle_update_all(
    &self,
    table: String,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| err_response("Data required for updateAll"))?;

    let raw_records = data_val
      .as_array()
      .ok_or_else(|| err_response("Data must be an array for updateAll"))?
      .clone();

    let mut validated_records: Vec<Value> = Vec::with_capacity(raw_records.len());
    let projection = RelationConfig::get_relation_exclusion_projection(&table);
    for record in raw_records {
      let stripped = projection.apply_recursive(&record);
      let validated = validate_model(&table, &stripped, false)
        .map_err(|e| err_response_formatted("Validation failed in updateAll", &e))?;
      validated_records.push(validated);
    }

    for record in &validated_records {
      if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
        let _ = if self.use_json_provider(sync_metadata.as_ref()) {
          self.json_provider.update(&table, id, record.clone()).await
        } else if let Some(ref mongo) = self.mongodb_provider {
          mongo.update(&table, id, record.clone()).await
        } else {
          return Err(err_response("No provider available"));
        };
      }
    }

    let projected_records = self.apply_projection_recursive(validated_records);
    Ok(success_response(DataValue::Array(projected_records)))
  }

  async fn handle_delete(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
    is_permanent: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("ID required for delete"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      get_provider_type(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let metadata_is_private = sync_metadata
      .as_ref()
      .map(|m| m.is_private)
      .unwrap_or(false);
    let metadata_is_owner = sync_metadata.as_ref().map(|m| m.is_owner).unwrap_or(true);

    if is_permanent {
      match provider_type {
        ProviderType::Mongo => {
          if let Some(ref mongo) = self.mongodb_provider {
            let _ = mongo
              .delete(&table, &id_str)
              .await
              .map_err(|e| err_response_formatted("Delete failed", &e.to_string()))?;
          }
          self
            .cascade_service
            .permanent_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
        _ => {
          let _ = self
            .json_provider
            .delete(&table, &id_str)
            .await
            .map_err(|e| err_response_formatted("Delete failed", &e.to_string()))?;
          self
            .cascade_service
            .permanent_delete_cascade_json(&table, &id_str)
            .await?;
        }
      }
    } else {
      match provider_type {
        ProviderType::Mongo => {
          self
            .cascade_service
            .soft_delete_cascade_mongo(&table, &id_str)
            .await?;
          if metadata_is_private && metadata_is_owner {
            self
              .cascade_service
              .soft_delete_cascade_json(&table, &id_str)
              .await
              .ok();
          }
        }
        _ => {
          self
            .cascade_service
            .soft_delete_cascade_json(&table, &id_str)
            .await?;
          if metadata_is_private && metadata_is_owner {
            self
              .cascade_service
              .soft_delete_cascade_mongo(&table, &id_str)
              .await
              .ok();
          }
        }
      }
    }

    self.invalidate_cache(&table).await;
    self
      .capture_change("delete", &table, &id_str, json!({"id": id_str.clone()}))
      .await;

    self
      .activity_monitor
      .log_action(&table, "delete", &json!({"id": id_str.clone()}), None)
      .await;

    Ok(success_response(DataValue::String(id_str)))
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
    let id_str = id.ok_or_else(|| err_response("ID required for restore"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      get_provider_type(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    match provider_type {
      ProviderType::Mongo => {
        self
          .cascade_service
          .restore_cascade_mongo(&table, &id_str)
          .await?;
      }
      _ => {
        self
          .cascade_service
          .restore_cascade_json(&table, &id_str)
          .await?;
      }
    }

    Ok(success_response(DataValue::String(id_str)))
  }

  async fn handle_sync_to_provider(
    &self,
    table: String,
    id: String,
    target_provider: ProviderType,
    _sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    match target_provider {
      ProviderType::Mongo => {
        self
          .cascade_service
          .sync_entity_to_mongo(&table, &id)
          .await?;
      }
      _ => {
        self
          .cascade_service
          .sync_entity_to_json(&table, &id)
          .await?;
      }
    }

    Ok(success_response(DataValue::String(id)))
  }

  async fn handle_restore(
    &self,
    table: String,
    id: Option<String>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("ID required for restore"))?;

    let provider_type = if let Some(ref metadata) = sync_metadata {
      get_provider_type(metadata).unwrap_or(ProviderType::Json)
    } else {
      ProviderType::Json
    };

    let patch = json!({ "deleted_at": serde_json::Value::Null });

    let _ = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .json_provider
        .patch(&table, &id_str, patch)
        .await
        .map_err(|e| err_response_formatted("Restore failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodb_provider {
      mongo
        .patch(&table, &id_str, patch)
        .await
        .map_err(|e| err_response_formatted("Restore failed", &e.to_string()))?
    } else {
      return Err(err_response("No provider available"));
    };

    match provider_type {
      ProviderType::Mongo => {
        self
          .cascade_service
          .handle_mongo_cascade(&table, &id_str, true)
          .await?;
      }
      _ => {
        self
          .cascade_service
          .handle_json_cascade(&table, &id_str, true)
          .await?;
      }
    }

    Ok(success_response(DataValue::String(id_str)))
  }
}
