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
  relation_obj::RelationObj,
  response_entity::{DataValue, ResponseModel},
  sync_metadata_entity::SyncMetadata,
  table_entity::validate_model,
};

/* helpers */
use crate::helpers::{
  response_helper::{err_response, err_response_formatted, success_response},
  security_helper::security_projection,
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
    sync_metadata.map_or(true, |m| m.is_owner && m.is_private)
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
      _repo: &RepositoryService,
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
        result_docs = collection_adder(result_docs, table);
        let segments: Vec<&str> = path.split('.').collect();
        match loader
          .load_nested(result_docs, &segments, table, true)
          .await
        {
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
    let projection = security_projection();
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

  fn _add_collection_metadata_to_relations(
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
      self._add_metadata_at_path(docs, &segments, target_coll);
    }
  }

  fn _add_metadata_at_path(&self, docs: &mut [Value], path_segments: &[&str], target_coll: &str) {
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
              self._add_metadata_at_path(&mut items, &path_segments[1..], target_coll);
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
        let target = if self.use_json_provider(sync_metadata.as_ref()) {
          ProviderType::Json
        } else {
          ProviderType::Mongo
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
    relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    tracing::debug!(
      "[RepositoryService] handle_get_all table={} filter={:?} relations={:?} load={:?}",
      table,
      filter,
      relations,
      load
    );

    let filter_val = filter.unwrap_or(json!({}));
    let filter_opt = self.build_filter(&filter_val);

    let use_json = self.use_json_provider(sync_metadata.as_ref());
    let docs = if use_json {
      self
        .json_provider
        .find_many(&table, filter_opt.as_ref(), None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?
    } else {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("MongoDB not available"))?;
      mongo
        .find_many(&table, filter_opt.as_ref(), None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?
    };

    let load_paths = load.as_ref().map(|l| l.clone()).unwrap_or_else(Vec::new);
    let docs = if !load_paths.is_empty() {
      self
        .load_relations_via_nosql_orm(docs, &table, &load_paths, !use_json)
        .await?
    } else {
      docs
    };

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
    let id = id.ok_or_else(|| err_response("ID is required for get operation"))?;
    let use_json = self.use_json_provider(sync_metadata.as_ref());

    let doc = if use_json {
      self
        .json_provider
        .find_by_id(&table, &id)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?
    } else {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("MongoDB not available"))?;
      mongo
        .find_by_id(&table, &id)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?
    };

    let doc = match doc {
      Some(d) => d,
      None => return Err(err_response("Document not found")),
    };

    let load_paths = load.as_ref().map(|l| l.clone()).unwrap_or_else(Vec::new);
    let docs = if !load_paths.is_empty() {
      self
        .load_relations_via_nosql_orm(vec![doc], &table, &load_paths, !use_json)
        .await?
    } else {
      vec![doc]
    };

    Ok(success_response(DataValue::Object(
      self
        .apply_projection_recursive(docs)
        .into_iter()
        .next()
        .unwrap_or(json!({})),
    )))
  }

  async fn handle_create(
    &self,
    table: String,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| err_response("Data required for create"))?;

    let validated_data = validate_model(&table, &data_val, true)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let use_json = self.use_json_provider(sync_metadata.as_ref());

    let created_record = if use_json {
      self
        .json_provider
        .insert(&table, validated_data)
        .await
        .map_err(|e| err_response_formatted("Create failed in JSON", &e.to_string()))?
    } else {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("MongoDB not available"))?;
      mongo
        .insert(&table, validated_data)
        .await
        .map_err(|e| err_response_formatted("Create failed in MongoDB", &e.to_string()))?
    };

    self.invalidate_cache(&table).await;
    let id_str = created_record
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    self
      .capture_change("insert", &table, id_str, created_record.clone())
      .await;

    self
      .activity_monitor
      .log_action(&table, "create", &created_record, None)
      .await;

    let projection = security_projection();
    let response_doc = projection.apply_recursive(&created_record);
    Ok(success_response(DataValue::Object(response_doc)))
  }

  async fn handle_update(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("Data required for update"))?;
    let data_val = data.ok_or_else(|| err_response("Data required for update"))?;

    let data_val = data_val.clone();

    let validated_data = validate_model(&table, &data_val, false)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let use_json = self.use_json_provider(sync_metadata.as_ref());
    let was_in_json = use_json;

    let updated_record = if use_json {
      self
        .json_provider
        .update(&table, &id_str, validated_data.clone())
        .await
        .map_err(|e| err_response_formatted("Update failed in JSON", &e.to_string()))?
    } else {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("MongoDB not available"))?;
      mongo
        .update(&table, &id_str, validated_data.clone())
        .await
        .map_err(|e| err_response_formatted("Update failed in MongoDB", &e.to_string()))?
    };

    let new_visibility = validated_data.get("visibility").and_then(|v| v.as_str());
    if let Some(new_vis) = new_visibility {
      let target_is_json = new_vis == "private";
      if target_is_json != was_in_json {
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

    let projection = security_projection();
    let response_doc = projection.apply_recursive(&updated_record);
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
    for record in raw_records {
      let validated = validate_model(&table, &record, false)
        .map_err(|e| err_response_formatted("Validation failed in updateAll", &e))?;
      validated_records.push(validated);
    }

    let use_json = self.use_json_provider(sync_metadata.as_ref());

    for record in &validated_records {
      if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
        if use_json {
          if let Err(e) = self.json_provider.update(&table, id, record.clone()).await {
            tracing::warn!(
              "[RepositoryService] updateAll failed to update {} in table {}: {}",
              id,
              table,
              e
            );
          }
        } else if let Some(ref mongo) = self.mongodb_provider {
          if let Err(e) = mongo.update(&table, id, record.clone()).await {
            tracing::warn!(
              "[RepositoryService] updateAll failed to update {} in table {} (MongoDB): {}",
              id,
              table,
              e
            );
          }
        } else {
          return Err(err_response("No provider available"));
        }
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

    let use_json = self.use_json_provider(sync_metadata.as_ref());

    let metadata_is_private = sync_metadata
      .as_ref()
      .map(|m| m.is_private)
      .unwrap_or(false);
    let metadata_is_owner = sync_metadata.as_ref().map(|m| m.is_owner).unwrap_or(true);

    if is_permanent {
      if !use_json {
        {
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
      } else {
        {
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
      if !use_json {
        {
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
      } else {
        {
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

    let use_json = self.use_json_provider(sync_metadata.as_ref());

    if !use_json {
      {
        self
          .cascade_service
          .restore_cascade_mongo(&table, &id_str)
          .await?;
      }
    } else {
      {
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

    let use_json = self.use_json_provider(sync_metadata.as_ref());

    let patch = json!({ "deleted_at": serde_json::Value::Null });

    let _ = if use_json {
      self
        .json_provider
        .patch(&table, &id_str, patch)
        .await
        .map_err(|e| err_response_formatted("Restore failed", &e.to_string()))?
    } else {
      let mongo = self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| err_response("MongoDB not available"))?;
      mongo
        .patch(&table, &id_str, patch)
        .await
        .map_err(|e| err_response_formatted("Restore failed", &e.to_string()))?
    };

    if !use_json {
      self
        .cascade_service
        .handle_mongo_cascade(&table, &id_str, true)
        .await?;
    } else {
      self
        .cascade_service
        .handle_json_cascade(&table, &id_str, true)
        .await?;
    }

    Ok(success_response(DataValue::String(id_str)))
  }
}
