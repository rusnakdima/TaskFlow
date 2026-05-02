/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::cache::QueryCache;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;
use nosql_orm::relations::RelationLoader;

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  relation_obj::RelationObj,
  response_entity::{DataValue, ResponseModel},
  table_entity::validate_model,
};

/* helpers */
use crate::helpers::{
  response_helper::{err_response, err_response_formatted, success_response},
  security_helper::security_projection,
};

/* services */
use crate::providers::data_provider::DataProvider;
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::cascade::CascadeService;
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
}

impl RepositoryService {
  #[allow(clippy::extra_unused_lifetimes)]
  fn get_provider(
    &self,
    table: &str,
    visibility: Option<&str>,
  ) -> Result<DataProvider<'_>, ResponseModel> {
    let use_json = self.use_json_provider(table, visibility);
    tracing::info!(
      "[Repository] get_provider: table={}, use_json={}, visibility={:?}",
      table,
      use_json,
      visibility
    );

    if use_json {
      Ok(DataProvider::Json(&self.json_provider))
    } else {
      match self.mongodb_provider.as_ref() {
        Some(p) => Ok(DataProvider::Mongo(p.as_ref())),
        None => {
          tracing::error!("[Repository] MongoDB not available - cannot use for team data");
          Err(err_response(
            "MongoDB not available - team data requires cloud connection",
          ))
        }
      }
    }
  }

  #[allow(clippy::too_many_arguments)]
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
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    self.query_cache = Some(Arc::new(cache));
    self
  }

  fn use_json_provider_for_visibility(visibility: &str) -> bool {
    let result = visibility == "private";
    tracing::info!(
      "[Repository] use_json_provider_for_visibility: visibility={}, result={}",
      visibility,
      result
    );
    result
  }

  fn use_json_provider(&self, table: &str, visibility: Option<&str>) -> bool {
    if table == "daily_activities" {
      tracing::info!(
        "[Repository] use_json_provider: table={} always JSON (daily_activities)",
        table
      );
      return true;
    }
    let vis = visibility.unwrap_or("private");
    let result = vis == "private";
    tracing::info!(
      "[Repository] use_json_provider: table={}, visibility={:?}, result={}",
      table,
      vis,
      result
    );
    result
  }

  fn build_filter(&self, filter_value: &Value) -> Option<Filter> {
    tracing::info!("[Repository] build_filter: input={}", filter_value);

    if filter_value.is_object() && filter_value.as_object().map_or(true, |obj| obj.is_empty()) {
      tracing::info!("[Repository] build_filter: empty filter, returning None");
      return None;
    }

    let result = Filter::from_json(filter_value).ok();
    tracing::info!("[Repository] build_filter: result={:?}", result);
    result
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
    _relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    match operation.as_str() {
      "getAll" => {
        self
          .handle_get_all(table, filter, _relations, load, visibility)
          .await
      }
      "get" => self.handle_get(table, id, load, visibility, filter).await,
      "create" => self.handle_create(table, data, visibility).await,
      "update" => self.handle_update(table, id, data, visibility).await,
      "updateAll" => self.handle_update_all(table, data, visibility).await,
      "delete" => self.handle_delete(table, id, visibility, false).await,
      "permanent-delete" => {
        self
          .handle_permanent_delete_cascade(table, id, visibility)
          .await
      }
      "soft-delete-cascade" => self.handle_soft_delete_cascade(table, id, visibility).await,
      "sync-to-provider" => {
        let target = if self.use_json_provider(&table, visibility.as_deref()) {
          ProviderType::Json
        } else {
          ProviderType::Mongo
        };
        let id_str = id.ok_or_else(|| err_response("ID required for sync"))?;
        self
          .handle_sync_to_provider(table, id_str, target, visibility)
          .await
      }
      _ => Err(err_response(&format!("Unknown operation: {}", operation))),
    }
  }

  async fn handle_get_all(
    &self,
    table: String,
    filter: Option<Value>,
    _relations: Option<Vec<RelationObj>>,
    load: Option<Vec<String>>,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter_val = filter.unwrap_or(json!({}));
    tracing::info!(
      "[Repository] handle_get_all: table={}, filter={}, visibility={:?}",
      table,
      filter_val,
      visibility
    );

    let filter_opt = self.build_filter(&filter_val);
    tracing::info!("[Repository] handle_get_all: built filter={:?}", filter_opt);

    let use_json = self.use_json_provider(&table, visibility.as_deref());
    tracing::info!(
      "[Repository] handle_get_all: use_json_provider={} for table={}",
      use_json,
      table
    );

    let provider = self.get_provider(&table, visibility.as_deref())?;
    tracing::info!("[Repository] handle_get_all: provider selected");

    let docs = provider.find_many(&table, filter_opt.as_ref()).await?;
    tracing::info!(
      "[Repository] handle_get_all: find_many returned {} docs",
      docs.len()
    );

    let load_paths: Vec<String> = load.map(|l| l.into_iter().collect()).unwrap_or_default();

    let docs = if !load_paths.is_empty() {
      if matches!(provider, DataProvider::Mongo(_)) {
        if let Some(ref mongo) = self.mongodb_provider {
          self
            .load_relations_for_get_all(docs, &table, &load_paths, mongo.as_ref().clone())
            .await?
        } else {
          docs
        }
      } else {
        self
          .load_relations_for_get_all(docs, &table, &load_paths, self.json_provider.clone())
          .await?
      }
    } else {
      docs
    };

    Ok(success_response(DataValue::Array(
      self.apply_projection_recursive(docs),
    )))
  }

  async fn load_relations_for_get_all<P: DatabaseProvider + Clone>(
    &self,
    docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
    provider: P,
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() || docs.is_empty() {
      return Ok(docs);
    }

    let mut current_docs = docs;
    for path in load_paths {
      let segments: Vec<&str> = path.split('.').collect();
      if segments.is_empty() {
        continue;
      }

      for doc in &mut current_docs {
        if let Some(obj) = doc.as_object_mut() {
          if !obj.contains_key("_collection") {
            obj.insert("_collection".to_string(), Value::String(table.to_string()));
          }
        }
      }

      let loader = RelationLoader::new(provider.clone());
      let Ok(loaded) = loader
        .load_nested(current_docs, &segments, table, true)
        .await
      else {
        let e = "Relation loading failed";
        return Err(err_response(e));
      };
      current_docs = loaded;
    }

    Ok(current_docs)
  }

  async fn handle_get(
    &self,
    table: String,
    id: Option<String>,
    load: Option<Vec<String>>,
    visibility: Option<String>,
    filter: Option<Value>,
  ) -> Result<ResponseModel, ResponseModel> {
    let provider = self.get_provider(&table, visibility.as_deref())?;

    let doc = if let Some(id_val) = id {
      provider.find_by_id(&table, &id_val).await?
    } else if let Some(f) = &filter {
      let filter_obj = nosql_orm::query::Filter::from_json(f)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
      provider.find_one(&table, Some(&filter_obj)).await?
    } else {
      return Err(err_response("ID or filter is required for get operation"));
    };

    let doc = match doc {
      Some(d) => d,
      None => {
        return Err(err_response("Document not found"));
      }
    };

    // Only load relations if explicitly requested via load parameter
    let load_paths: Vec<String> = load.map(|l| l.into_iter().collect()).unwrap_or_default();

    let docs = if !load_paths.is_empty() {
      self
        .load_relations_via_nosql_orm(
          vec![doc],
          &table,
          &load_paths,
          matches!(provider, DataProvider::Mongo(_)),
        )
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
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let data_val = data.ok_or_else(|| err_response("Data required for create"))?;

    let visibility_str = visibility.unwrap_or_else(|| "private".to_string());

    let provider = self.get_provider(&table, Some(&visibility_str))?;

    let validated_data = validate_model(&table, &data_val, true)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let created_record = provider.insert(&table, validated_data).await?;

    self.invalidate_cache(&table).await;

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
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("Data required for update"))?;
    let data_val = data.ok_or_else(|| err_response("Data required for update"))?;

    let validated_data = validate_model(&table, &data_val, false)
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let visibility_str = visibility.as_deref();
    let provider = self.get_provider(&table, visibility_str)?;
    let updated_record = provider
      .update(&table, &id_str, validated_data.clone())
      .await?;

    let new_visibility = validated_data.get("visibility").and_then(|v| v.as_str());
    let old_visibility = updated_record.get("visibility").and_then(|v| v.as_str());

    if let (Some(new_vis), Some(old_vis)) = (new_visibility, old_visibility) {
      if new_vis != old_vis {
        if Self::use_json_provider_for_visibility(new_vis) {
          self
            .cascade_service
            .import_todo_cascade_to_json(&id_str)
            .await?;
        } else {
          self
            .cascade_service
            .export_todo_cascade_to_mongo(&id_str)
            .await?;
        }
      }
    }

    self.invalidate_cache(&table).await;

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
    visibility: Option<String>,
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

    let provider = self.get_provider(&table, visibility.as_deref())?;

    for record in &validated_records {
      if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
        if let Err(e) = provider.update(&table, id, record.clone()).await {
          tracing::warn!(
            "[RepositoryService] updateAll failed to update {} in table {}: {:?}",
            id,
            table,
            e
          );
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
    visibility: Option<String>,
    is_permanent: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let id_str = id.ok_or_else(|| err_response("ID required for delete"))?;
    let use_json = self.use_json_provider(&table, visibility.as_deref());

    if is_permanent {
      if use_json {
        let _ = self.json_provider.delete(&table, &id_str).await;
        self
          .cascade_service
          .permanent_delete_cascade_json(&table, &id_str)
          .await?;
      } else {
        if let Some(ref mongo) = self.mongodb_provider {
          let _ = mongo.delete(&table, &id_str).await;
        }
        self
          .cascade_service
          .permanent_delete_cascade_mongo(&table, &id_str)
          .await?;
      }
    } else {
      if use_json {
        self
          .cascade_service
          .soft_delete_cascade_json(&table, &id_str)
          .await?;
      } else {
        self
          .cascade_service
          .soft_delete_cascade_mongo(&table, &id_str)
          .await?;
      }
      if visibility.as_deref() == Some("private") {
        if use_json {
          self
            .cascade_service
            .soft_delete_cascade_mongo(&table, &id_str)
            .await
            .ok();
        } else {
          self
            .cascade_service
            .soft_delete_cascade_json(&table, &id_str)
            .await
            .ok();
        }
      }
    }

    self.invalidate_cache(&table).await;

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
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    self.handle_delete(table, id, visibility, false).await
  }

  async fn handle_permanent_delete_cascade(
    &self,
    table: String,
    id: Option<String>,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    self.handle_delete(table, id, visibility, true).await
  }

  async fn handle_sync_to_provider(
    &self,
    table: String,
    id: String,
    target: ProviderType,
    _visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    if target == ProviderType::Mongo {
      self
        .cascade_service
        .sync_entity_to_mongo(&table, &id)
        .await?;
    } else {
      self
        .cascade_service
        .sync_entity_to_json(&table, &id)
        .await?;
    }
    Ok(success_response(DataValue::String(id)))
  }
}
