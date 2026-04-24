/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cache::QueryCache;
use nosql_orm::cdc::ChangeCapture;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;
use nosql_orm::relations::RelationLoader;

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  relation_config::user_projection,
  relation_obj::RelationObj,
  response_entity::{DataValue, ResponseModel},
  sync_metadata_entity::SyncMetadata,
  table_entity::validate_model,
};

/* helpers */
use crate::helpers::{
  common::get_provider_type,
  filter_helper::FilterBuilder,
  response_helper::{err_response, err_response_formatted, success_response},
  user_sync_helper,
};

/* services */
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::cascade::CascadeService;
use crate::services::entity_resolution_service::EntityResolutionService;

pub struct RepositoryService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub cascade_service: CascadeService,
  pub entity_resolution: Arc<EntityResolutionService>,
  pub activity_monitor: ActivityMonitorService,
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
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      cascade_service,
      entity_resolution,
      activity_monitor,
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
    FilterBuilder::from_json(filter_value)
  }

  async fn load_relations_json(
    &self,
    docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
    _use_mongo: bool,
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() {
      // Apply projection to docs even when no relations requested
      let projection = user_projection();
      let projected: Vec<Value> = docs.iter().map(|d| projection.apply(d)).collect();
      return Ok(projected);
    }

    let mut current_docs = docs;
    let _base_table = table.to_string();
    let projection = user_projection();

    // First apply projection to the main documents
    let mut projected_docs: Vec<Value> = Vec::new();
    for doc in current_docs.iter() {
      projected_docs.push(projection.apply(doc));
    }
    current_docs = projected_docs;

    // Process each path, handling multi-segment paths by loading level by level
    for path in load_paths {
      let segments: Vec<&str> = path.split('.').collect();
      if segments.is_empty() {
        continue;
      }

      tracing::info!(
        "[REPO] Loading relations for table={}, path={:?}, segments={:?}",
        table,
        path,
        segments
      );

      // For multi-segment paths, we process segment by segment
      // Each segment builds on the previous one's results
      let mut docs_to_process = current_docs.clone();

      // Track parent docs for merge (after first segment, before processing nested segments)
      let mut parent_docs_for_merge: Option<Vec<Value>> = None;

      // Build a mapping of segment to its parent IDs
      let mut parent_ids_by_segment: Vec<Vec<String>> = Vec::new();
      parent_ids_by_segment.push(Vec::new()); // Initialize for first segment

      for (idx, segment) in segments.iter().enumerate() {
        tracing::info!(
          "[REPO] Loading segment {} of {}: {}",
          idx + 1,
          segments.len(),
          segment
        );

        // Save parent docs before processing nested segments (at idx=1, before loading subtasks/comments)
        if idx == 1 {
          parent_docs_for_merge = Some(docs_to_process.clone());
        }

        let loader = RelationLoader::new(self.json_provider.clone());

        // Determine which table to use for this segment
        // For idx=0, use the root table. For subsequent segments, use the previous segment
        // (the parent collection where the relation is defined)
        let current_table = if idx == 0 { table } else { segments[idx - 1] };

        // Extract parent IDs from the current docs (from previous segment's results)
        // For subsequent segments, extract from the nested segment (previous segment's loaded data)
        if idx > 0 {
          let parent_ids: Vec<String> = if segments.len() > 1 && idx == 1 {
            // For first nested segment (e.g., "subtasks" in "tasks.subtasks"),
            // extract IDs from the previously loaded segment (e.g., "tasks")
            docs_to_process
              .iter()
              .filter_map(|d| {
                // Get from the previous segment's nested array
                d.get(segments[idx - 1])
                  .and_then(|v| v.as_array())
                  .map(|arr| {
                    arr.iter()
                      .filter_map(|item| item.get("id").and_then(|v| v.as_str()).map(String::from))
                      .collect::<Vec<String>>()
                  })
              })
              .flatten()
              .collect()
          } else {
            // Default: extract from root document ID
            docs_to_process
              .iter()
              .filter_map(|d| d.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
              .collect()
          };
          tracing::info!(
            "[REPO] Extracted {} parent IDs for segment '{}': {:?}",
            parent_ids.len(),
            segment,
            parent_ids.iter().take(3).collect::<Vec<_>>()
          );
          if parent_ids_by_segment.len() <= idx {
            parent_ids_by_segment.push(parent_ids);
          } else {
            parent_ids_by_segment[idx] = parent_ids;
          }
        }

        // Prepare docs with collection metadata
        for doc in docs_to_process.iter_mut() {
          if let Some(obj) = doc.as_object_mut() {
            obj.insert(
              "_collection".to_string(),
              Value::String(current_table.to_string()),
            );
          }
        }

        // Load this level for all docs
        match loader
          .load_nested(docs_to_process.clone(), &[*segment], true)
          .await
        {
          Ok(loaded_docs) => {
            tracing::info!(
              "[REPO] Segment '{}' loaded, {} docs returned",
              segment,
              loaded_docs.len()
            );
            // Show first loaded doc structure for debugging
            if let Some(first) = loaded_docs.first() {
              tracing::debug!(
                "[REPO] First loaded doc keys: {:?}",
                first.as_object().map(|o| o.keys().collect::<Vec<_>>())
              );
              tracing::debug!("[REPO] First loaded doc: {}", first);
            }
            docs_to_process = loaded_docs;
          }
          Err(e) => {
            tracing::warn!("[REPO] Failed to load segment '{}': {}", segment, e);
            break;
          }
        }

        // Apply projection after each segment
        let mut projected: Vec<Value> = Vec::new();
        for doc in docs_to_process.iter() {
          if let Some(obj) = doc.as_object() {
            let mut obj_clone = obj.clone();
            obj_clone.remove("_collection");
            let p = projection.apply(&Value::Object(obj_clone));
            projected.push(p);
          } else {
            projected.push(doc.clone());
          }
        }
        docs_to_process = projected;
      }

      // Merge loaded relations back - need to attach them to the parent documents
      // For now, just use the final result of multi-segment loading
      let final_docs = if !docs_to_process.is_empty() {
        docs_to_process.clone()
      } else {
        Vec::new()
      };

      // If this was a single-segment path, use result directly
      if segments.len() == 1 {
        current_docs = docs_to_process;
      } else {
        // For multi-segment, we need to properly merge results back
        // The loaded docs contain all nested relations - need to attach to parents
        if !final_docs.is_empty() {
          // Use the saved parent docs (with tasks attached) for merging
          let parent_docs = parent_docs_for_merge.unwrap_or_else(|| current_docs.clone());
          
          // Extract the first segment (tasks) from parent docs
          let first_segment_docs: Vec<Value> = parent_docs
            .iter()
            .filter_map(|d| d.get(segments[0]).and_then(|v| v.as_array()).cloned())
            .flatten()
            .collect();
          
          let merged = self.merge_nested_results(first_segment_docs, final_docs, &segments);
          current_docs = merged;
        }
      }
    }

    Ok(current_docs)
  }

  /// Merge nested results back into parent documents
  /// For "tasks.subtasks", this attaches subtasks to their parent tasks
  fn merge_nested_results(
    &self,
    parents: Vec<Value>,
    nested_results: Vec<Value>,
    segments: &[&str],
  ) -> Vec<Value> {
    if segments.len() < 2 {
      return nested_results;
    }

    let parent_segment = segments[0]; // e.g., "tasks"
    let child_segment = segments[1]; // e.g., "subtasks"

    tracing::info!(
      "[REPO] merge_nested_results: parent_segment={}, child_segment={}, parents={}, nested={}",
      parent_segment,
      child_segment,
      parents.len(),
      nested_results.len()
    );

    // Determine the foreign key field on the child that references the parent
    let foreign_key = match child_segment {
      "subtasks" | "comments" => "task_id",
      "tasks" => "todo_id",
      "profile" => "id",
      _ => "id",
    };

    tracing::info!("[REPO] Using foreign_key='{}' for grouping", foreign_key);

    // Group nested results by their foreign key
    let mut grouped: std::collections::HashMap<String, Vec<Value>> =
      std::collections::HashMap::new();
    for doc in nested_results.iter() {
      if let Some(fk_value) = doc.get(foreign_key).and_then(|v| v.as_str()) {
        let key = fk_value.to_string();
        grouped
          .entry(key)
          .or_insert_with(Vec::new)
          .push(doc.clone());
      }
    }

    tracing::info!("[REPO] Grouped {} parent keys", grouped.len());

    // Attach nested results to parent documents (the first segment)
    let mut result: Vec<Value> = Vec::new();
    for parent in parents.iter() {
      if let Some(parent_obj) = parent.as_object() {
        let mut parent_clone = parent_obj.clone();

        // Get parent ID
        if let Some(parent_id) = parent_obj.get("id").and_then(|v| v.as_str()) {
          // Check if there are children grouped under this parent
          if let Some(children) = grouped.get(parent_id) {
            parent_clone.insert(child_segment.to_string(), Value::Array(children.clone()));
            tracing::debug!(
              "[REPO] Attached {} {} to parent {}",
              children.len(),
              child_segment,
              parent_id
            );
          } else {
            // No children found, insert empty array
            parent_clone.insert(child_segment.to_string(), Value::Array(Vec::new()));
          }
        }

        result.push(Value::Object(parent_clone));
      } else {
        result.push(parent.clone());
      }
    }

    tracing::info!(
      "[REPO] merge_nested_results returning {} docs",
      result.len()
    );
    result
  }

  /// Recursively filter sensitive fields from all user objects at any nesting level
  fn filter_sensitive_fields_recursive(&self, value: &mut Value) {
    use crate::entities::relation_config::FRONTEND_EXCLUDED_FIELDS;

    if let Some(obj) = value.as_object_mut() {
      // Apply projection to user field if present
      if let Some(user_val) = obj.get("user") {
        if let Some(user) = user_val.as_object() {
          let mut filtered = user.clone();
          for field in FRONTEND_EXCLUDED_FIELDS {
            filtered.remove(*field);
          }
          obj.insert("user".to_string(), Value::Object(filtered));
        }
      }

      // Recursively handle all nested values
      for (_key, val) in obj.iter_mut() {
        self.filter_sensitive_fields_recursive(val);
      }
    } else if let Some(arr) = value.as_array_mut() {
      for item in arr.iter_mut() {
        self.filter_sensitive_fields_recursive(item);
      }
    }
  }

  /// Ensure all user objects in documents have sensitive fields removed
  fn ensure_user_projection(&self, docs: &mut Vec<Value>) {
    for doc in docs.iter_mut() {
      self.filter_sensitive_fields_recursive(doc);
    }
  }

  fn apply_frontend_projection(&self, doc: Value, _table: &str) -> Value {
    user_projection().apply(&doc)
  }

  fn apply_projection_to_docs(&self, docs: Vec<Value>, _table: &str) -> Vec<Value> {
    let projection = user_projection();
    docs.iter().map(|doc| projection.apply(doc)).collect()
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
    tracing::warn!(
      "[REPO] handle_get_all ENTRY - table={}, filter={:?}, load={:?}, sync_metadata={:?}",
      table,
      filter,
      load,
      sync_metadata
    );

    let orm_filter = filter.as_ref().and_then(|f| self.build_filter(f));

    tracing::info!(
      target: "query_logger",
      "[QUERY] FIND_MANY on '{}' raw_filter={:?} orm_filter={:?}",
      table,
      filter,
      orm_filter.as_ref().map(|f| format!("{:?}", f))
    );

    tracing::debug!(
      "[DEBUG] use_json_provider = {} for sync_metadata: {:?}",
      self.use_json_provider(sync_metadata.as_ref()),
      sync_metadata
    );

    let cache_key = self.query_cache.as_ref().map(|cache| {
      let filter_json = filter
        .as_ref()
        .map(|f| serde_json::to_string(f).unwrap_or_default());
      let key = cache.cache_key(&table, filter_json.as_deref(), None, None, None);
      tracing::debug!("[DEBUG] cache_key generated: {}", key);
      key
    });

    if let (Some(ref cache), Some(ref key)) = (&self.query_cache, &cache_key) {
      if let Ok(Some(cached_docs)) = cache.get::<Vec<Value>>(key).await {
        tracing::debug!("[CACHE] Cache hit for query: {}", key);
        let mut docs = cached_docs;
        if let Some(ref load_paths) = load {
          let use_mongo = !self.use_json_provider(sync_metadata.as_ref());
          docs = self
            .load_relations_json(docs, &table, load_paths, use_mongo)
            .await?;
        }
        docs = self.apply_projection_to_docs(docs, &table);
        return Ok(success_response(DataValue::Array(docs)));
      } else {
        tracing::debug!("[CACHE] Cache miss for query: {}", key);
      }
    }

    let mut docs = if self.use_json_provider(sync_metadata.as_ref()) {
      tracing::debug!("[DEBUG] Using JSON provider, filter: {:?}", orm_filter);
      self
        .json_provider
        .find_many(&table, orm_filter.as_ref(), None, None, None, true)
        .await
        .map_err(|e| err_response_formatted("Get all failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodb_provider {
      tracing::debug!("[DEBUG] Using MongoDB provider, filter: {:?}", orm_filter);
      mongo
        .find_many(&table, orm_filter.as_ref(), None, None, None, true)
        .await
        .map_err(|e| err_response_formatted("Get all failed", &e.to_string()))?
    } else {
      tracing::warn!("[DEBUG] No provider available, returning empty vec");
      Vec::new()
    };

    tracing::warn!(
      "[REPO] handle_get_all DOCS FROM PROVIDER - table={}, count={}",
      table,
      docs.len()
    );
    if !docs.is_empty() {
      tracing::warn!(
        "[REPO] handle_get_all - First doc keys: {:?}",
        docs[0].as_object().map(|m| m.keys().collect::<Vec<_>>())
      );
    }

    tracing::info!(
      target: "query_logger",
      "[QUERY] FIND_MANY on '{}' returned {} results",
      table,
      docs.len()
    );

    if let (Some(ref cache), Some(ref key)) = (&self.query_cache, &cache_key) {
      if !docs.is_empty() {
        let _ = cache.set(key.clone(), &docs).await;
        tracing::debug!("Cached query result: {}", key);
      }
    }

    if let Some(ref load_paths) = load {
      tracing::info!(
        "[REPO] Loading relations for table={}, paths={:?}",
        table,
        load_paths
      );
      let use_mongo = !self.use_json_provider(sync_metadata.as_ref());
      docs = self
        .load_relations_json(docs, &table, load_paths, use_mongo)
        .await?;
    }

    // CRITICAL: Ensure sensitive user fields are removed from ALL nested objects
    self.ensure_user_projection(&mut docs);

    if !docs.is_empty() {
      tracing::warn!(
        "[REPO] handle_get_all - RETURNING {} docs, first doc has keys: {:?}",
        docs.len(),
        docs[0].as_object().map(|m| m.keys().collect::<Vec<_>>())
      );
    }

    docs = self.apply_projection_to_docs(docs, &table);

    Ok(success_response(DataValue::Array(docs)))
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

    let doc = if self.use_json_provider(sync_metadata.as_ref()) {
      self
        .json_provider
        .find_by_id(&table, &id_str)
        .await
        .map_err(|e| err_response_formatted("Get failed", &e.to_string()))?
    } else if let Some(ref mongo) = self.mongodb_provider {
      mongo
        .find_by_id(&table, &id_str)
        .await
        .map_err(|e| err_response_formatted("Get failed", &e.to_string()))?
    } else {
      return Err(err_response("No provider available"));
    };

    match doc {
      Some(d) => {
        let mut entity_with_relations = if let Some(ref load_paths) = load {
          let entities = vec![d.clone()];
          let use_mongo = !self.use_json_provider(sync_metadata.as_ref());
          match self
            .load_relations_json(entities, &table, load_paths, use_mongo)
            .await
          {
            Ok(loaded) => loaded.into_iter().next().unwrap_or(d),
            Err(_) => d,
          }
        } else {
          d
        };

        // Apply frontend projection for top-level fields
        entity_with_relations = self.apply_frontend_projection(entity_with_relations, &table);

        // CRITICAL: Ensure sensitive user fields are removed from ALL nested objects
        let mut docs = vec![entity_with_relations.clone()];
        self.ensure_user_projection(&mut docs);
        entity_with_relations = docs.into_iter().next().unwrap_or(entity_with_relations);

        Ok(success_response(DataValue::Object(entity_with_relations)))
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
      return self.create_profile_with_user_update(data_val).await;
    }

    let validated_data = validate_model(&table, &data_val, true)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let validated_data = self.strip_relation_fields(&table, validated_data);

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

    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(&table).await;
    }

    if let Some(ref cdc) = self.cdc_service {
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
      .activity_monitor
      .log_action(&table, "create", &created_record, None)
      .await;

    let response_doc = self.apply_frontend_projection(created_record, &table);
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

    let data_val = self.strip_relation_fields(&table, data_val);

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
        let _ = self
          .handle_sync_visibility_to_provider(id_str.clone(), source, target)
          .await;
      }
    }

    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(&table).await;
    }

    if let Some(ref cdc) = self.cdc_service {
      let change = nosql_orm::cdc::Change::update(
        &table,
        &id_str,
        serde_json::json!({}),
        updated_record.clone(),
      );
      let _ = cdc.capture(change).await;
    }

    self
      .activity_monitor
      .log_action(&table, "update", &updated_record, None)
      .await;

    let response_doc = self.apply_frontend_projection(updated_record, &table);
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
      let stripped = self.strip_relation_fields(&table, record);
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

    let projected_records = self.apply_projection_to_docs(validated_records, &table);
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

    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(&table).await;
    }

    if let Some(ref cdc) = self.cdc_service {
      let change =
        nosql_orm::cdc::Change::delete(&table, &id_str, serde_json::json!({"id": id_str.clone()}));
      let _ = cdc.capture(change).await;
    }

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
      "[RepositoryService] mongodb_provider.is_some()={}",
      self.mongodb_provider.is_some()
    );

    if source_provider == ProviderType::Json {
      eprintln!("[RepositoryService] SOURCE=JSON - reading from JSON and syncing to MongoDB");
      let todo_filter = Filter::Eq("id".to_string(), serde_json::json!(todo_id.clone()));
      let todos = self
        .json_provider
        .find_many("todos", Some(&todo_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let task_filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id.clone()));
      let tasks = self
        .json_provider
        .find_many("tasks", Some(&task_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let subtask_filter = Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| serde_json::json!(id)).collect(),
      );
      let subtasks = self
        .json_provider
        .find_many("subtasks", Some(&subtask_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let subtask_ids: Vec<String> = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let comment_filter = Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| serde_json::json!(id)).collect(),
      );
      let comment_filter = if subtask_ids.is_empty() {
        comment_filter
      } else {
        Filter::Or(vec![
          Filter::In(
            "task_id".to_string(),
            task_ids.iter().map(|id| serde_json::json!(id)).collect(),
          ),
          Filter::In(
            "subtask_id".to_string(),
            subtask_ids.iter().map(|id| serde_json::json!(id)).collect(),
          ),
        ])
      };
      let comments = self
        .json_provider
        .find_many("comments", Some(&comment_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let chat_filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id.clone()));
      let chats = self
        .json_provider
        .find_many("chats", Some(&chat_filter), None, None, None, false)
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
          if let Some(ref mongo) = self.mongodb_provider {
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
                .json_provider
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
        .filter(|t| t.get("todo_id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = task.get("id").and_then(|v| v.as_str()) {
          if let Some(ref mongo) = self.mongodb_provider {
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
                .json_provider
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
        if let Some(id) = subtask.get("id").and_then(|v| v.as_str()) {
          if let Some(ref mongo) = self.mongodb_provider {
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
              let now = chrono::Utc::now().to_rfc3339();
              let _ = self
                .json_provider
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
        if let Some(id) = comment.get("id").and_then(|v| v.as_str()) {
          if let Some(ref mongo) = self.mongodb_provider {
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
              let now = chrono::Utc::now().to_rfc3339();
              let _ = self
                .json_provider
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
        .filter(|c| c.get("todo_id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = chat.get("id").and_then(|v| v.as_str()) {
          if let Some(ref mongo) = self.mongodb_provider {
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
                .json_provider
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
    } else if let Some(ref mongo) = self.mongodb_provider {
      let todo_filter = Filter::Eq("id".to_string(), serde_json::json!(todo_id.clone()));
      let todos = mongo
        .find_many("todos", Some(&todo_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let task_filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id.clone()));
      let tasks = mongo
        .find_many("tasks", Some(&task_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let task_ids: Vec<String> = tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let subtask_filter = Filter::In(
        "task_id".to_string(),
        task_ids.iter().map(|id| serde_json::json!(id)).collect(),
      );
      let subtasks = mongo
        .find_many("subtasks", Some(&subtask_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let subtask_ids: Vec<String> = subtasks
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
      let comment_filter = if subtask_ids.is_empty() {
        Filter::In(
          "task_id".to_string(),
          task_ids.iter().map(|id| serde_json::json!(id)).collect(),
        )
      } else {
        Filter::Or(vec![
          Filter::In(
            "task_id".to_string(),
            task_ids.iter().map(|id| serde_json::json!(id)).collect(),
          ),
          Filter::In(
            "subtask_id".to_string(),
            subtask_ids.iter().map(|id| serde_json::json!(id)).collect(),
          ),
        ])
      };
      let comments = mongo
        .find_many("comments", Some(&comment_filter), None, None, None, false)
        .await
        .unwrap_or_default();
      let chat_filter = Filter::Eq("todo_id".to_string(), serde_json::json!(todo_id.clone()));
      let chats = mongo
        .find_many("chats", Some(&chat_filter), None, None, None, false)
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
            .json_provider
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
              let _ = self.json_provider.patch("todos", id, updated.clone()).await;
            } else {
              let _ = self.json_provider.insert("todos", updated.clone()).await;
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
              .json_provider
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
        .filter(|t| t.get("todo_id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = task.get("id").and_then(|v| v.as_str()) {
          let existing = self
            .json_provider
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
                .json_provider
                .patch("tasks", id, patch_with_visibility)
                .await;
            } else {
              let mut task_with_visibility = task.clone();
              if let Some(obj) = task_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .json_provider
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
        if let Some(id) = subtask.get("id").and_then(|v| v.as_str()) {
          let existing = self
            .json_provider
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
                .json_provider
                .patch("subtasks", id, patch_with_visibility)
                .await;
            } else {
              let mut subtask_with_visibility = subtask.clone();
              if let Some(obj) = subtask_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .json_provider
                .insert("subtasks", subtask_with_visibility)
                .await;
            }
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

      for comment in comments.iter() {
        if let Some(id) = comment.get("id").and_then(|v| v.as_str()) {
          let existing = self
            .json_provider
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
                .json_provider
                .patch("comments", id, patch_with_visibility)
                .await;
            } else {
              let mut comment_with_visibility = comment.clone();
              if let Some(obj) = comment_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .json_provider
                .insert("comments", comment_with_visibility)
                .await;
            }
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

      for chat in chats
        .iter()
        .filter(|c| c.get("todo_id").and_then(|v| v.as_str()) == Some(&todo_id))
      {
        if let Some(id) = chat.get("id").and_then(|v| v.as_str()) {
          let existing = self
            .json_provider
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
                .json_provider
                .patch("chats", id, patch_with_visibility)
                .await;
            } else {
              let mut chat_with_visibility = chat.clone();
              if let Some(obj) = chat_with_visibility.as_object_mut() {
                obj.insert("visibility".to_string(), serde_json::json!(new_visibility));
                obj.insert("deleted_at".to_string(), serde_json::Value::Null);
              }
              let _ = self
                .json_provider
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

    Ok(success_response(DataValue::Number(synced_count as f64)))
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
    let validated_profile = validate_model("profiles", &profile_data, true)
      .map_err(|e| err_response_formatted("Profile validation failed", &e))?;

    let user_id = validated_profile
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if user_id.is_empty() {
      return Err(err_response("Invalid profile data: userId is required"));
    }

    eprintln!(
      "[RepositoryService] create_profile_with_user_update: Checking existing profile for user: {}",
      user_id
    );

    if let Ok(existing_profiles) = self.json_provider.find_all("profiles").await {
      for profile in existing_profiles {
        if profile.get("user_id").and_then(|v| v.as_str()) == Some(&user_id) {
          eprintln!(
            "[RepositoryService] create_profile_with_user_update: Profile already exists for user"
          );
          return Ok(success_response(DataValue::Object(profile)));
        }
      }
    }

    eprintln!("[RepositoryService] create_profile_with_user_update: Creating profile in JSON...");

    let created_profile = self
      .json_provider
      .insert("profiles", validated_profile.clone())
      .await
      .map_err(|e| {
        err_response_formatted("Error creating profile in local store", &e.to_string())
      })?;

    let profile_id = created_profile
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    eprintln!(
      "[RepositoryService] create_profile_with_user_update: Profile created in JSON: {}",
      profile_id
    );

    eprintln!(
      "[RepositoryService] create_profile_with_user_update: Updating user.profileId in JSON and MongoDB..."
    );

    if let Err(e) = user_sync_helper::update_user_profile_id_both(
      &self.json_provider,
      self.mongodb_provider.as_ref(),
      &user_id,
      &profile_id,
    )
    .await
    {
      eprintln!(
        "[RepositoryService] create_profile_with_user_update: FAILED to update user.profileId: {}",
        e.message
      );
      return Err(e);
    }

    eprintln!(
      "[RepositoryService] create_profile_with_user_update: User.profileId synced to both providers successfully"
    );

    // Sync profile to MongoDB if available (non-blocking)
    // Profile is already saved in JSON, so we log MongoDB failures as warnings, not errors
    if let Some(ref mongo) = self.mongodb_provider {
      if let Err(e) = self.try_sync_profile_to_cloud(&profile_id, mongo).await {
        eprintln!(
          "[RepositoryService] create_profile_with_user_update: WARNING - Profile synced to JSON but MongoDB sync failed: {}",
          e
        );
      } else {
        eprintln!(
          "[RepositoryService] create_profile_with_user_update: Profile synced to MongoDB successfully"
        );
      }
    } else {
      eprintln!(
        "[RepositoryService] create_profile_with_user_update: WARNING - MongoDB not available, profile only saved to JSON"
      );
    }

    self
      .activity_monitor
      .log_action("profiles", "create", &created_profile, None)
      .await;

    eprintln!(
      "[RepositoryService] create_profile_with_user_update: Profile creation completed successfully"
    );

    Ok(success_response(DataValue::Object(created_profile)))
  }

  async fn try_sync_profile_to_cloud(
    &self,
    profile_id: &str,
    mongo: &MongoProvider,
  ) -> Result<(), String> {
    let profile_data = self
      .json_provider
      .find_by_id("profiles", profile_id)
      .await
      .map_err(|e| format!("Failed to read profile from JSON: {}", e))?
      .ok_or_else(|| "Profile not found in JSON".to_string())?;

    match mongo.find_by_id("profiles", profile_id).await {
      Ok(Some(existing_val)) => {
        let existing_time = existing_val
          .get("updated_at")
          .and_then(|v| v.as_str())
          .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
        let entity_time = profile_data
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
          mongo
            .update("profiles", profile_id, profile_data)
            .await
            .map_err(|e| format!("Failed to update profile in MongoDB: {}", e))?;
        }
      }
      Ok(None) => {
        mongo
          .insert("profiles", profile_data)
          .await
          .map_err(|e| format!("Failed to insert profile to MongoDB: {}", e))?;
      }
      Err(e) => {
        return Err(format!("Failed to check profile in MongoDB: {}", e));
      }
    }
    Ok(())
  }
}
