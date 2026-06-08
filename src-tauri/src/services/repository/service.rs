/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;
use std::sync::RwLock;
use std::time::Instant;

/* nosql_orm */
use nosql_orm::cache::QueryCache;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;
use nosql_orm::relations::RelationLoader;

/* entities */
use crate::entities::{
  provider_type_entity::ProviderType,
  response_entity::{DataValue, ResponseModel},
  table_entity::validate_model,
};
use tauri::Emitter;

/* helpers */
use crate::helpers::{
  collection_metadata::add_collection_metadata,
  load_param::parse_load_param,
  relation_stripper::strip_relation_fields,
  response_helper::{err_response, err_response_formatted, success_response},
  security_helper::security_projection,
  user_sync_helper,
};

/* services */
use crate::providers::data_provider::DataProvider;
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;
use crate::services::activity_monitor_service::ActivityMonitorService;
use crate::services::cascade::{CascadeService, CountService};
use crate::services::entity_resolution_service::EntityResolutionService;
use crate::services::permission_service::PermissionService;
use crate::services::profile_service::ProfileService;

use super::cache::CacheService;

#[derive(PartialEq)]
pub enum DataSource {
  Local,
  Cloud,
  Both,
}

pub struct RepositoryService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub cascade_service: CascadeService,
  pub count_service: Arc<CountService>,
  pub cache_service: CacheService,
  pub activity_monitor: ActivityMonitorService,
  pub profile_service: ProfileService,
  pub entity_resolution: Arc<EntityResolutionService>,
  app_handle: tauri::AppHandle,
  spawned_handles: RwLock<Vec<tokio::task::JoinHandle<()>>>,
}

impl Drop for RepositoryService {
  fn drop(&mut self) {
    if let Ok(handles) = self.spawned_handles.write() {
      for handle in handles.iter() {
        handle.abort();
      }
    }
  }
}

impl RepositoryService {
  fn determine_source(visibility: Option<&str>, mongodb_available: bool) -> DataSource {
    if !mongodb_available {
      return DataSource::Local;
    }

    match visibility.unwrap_or("all") {
      "local" | "private" => DataSource::Local,
      "all" => DataSource::Both,
      "cloud" | "shared" | "public" => DataSource::Cloud,
      _ => DataSource::Local,
    }
  }

  fn get_provider(
    &self,
    table: &str,
    visibility: Option<&str>,
  ) -> Result<DataProvider, ResponseModel> {
    if table == "daily_activities" {
      return Ok(DataProvider::Json(Arc::new(self.json_provider.clone())));
    }

    let mongodb_available = self.mongodb_provider.is_some();

    match Self::determine_source(visibility, mongodb_available) {
      DataSource::Local => Ok(DataProvider::Json(Arc::new(self.json_provider.clone()))),
      DataSource::Cloud => self
        .mongodb_provider
        .as_ref()
        .ok_or_else(|| {
          err_response(
            "MongoDB not available - cannot create shared/team records. Please connect to the internet or change todo visibility to private.",
          )
        })
        .map(|p| DataProvider::Mongo(p.clone())),
      DataSource::Both => match self.mongodb_provider.as_ref() {
        Some(p) => Ok(DataProvider::Both(Arc::new(self.json_provider.clone()), p.clone())),
        None => Ok(DataProvider::Json(Arc::new(self.json_provider.clone()))),
      },
    }
  }

  fn merge_documents(local: Vec<Value>, cloud: Vec<Value>) -> Vec<Value> {
    use std::collections::HashMap;
    let mut map: HashMap<String, Value> = HashMap::new();

    for doc in local {
      if let Some(id) = doc.get("id").or(doc.get("_id")).and_then(|v| v.as_str()) {
        map.insert(id.to_string(), doc);
      }
    }

    for doc in cloud {
      if let Some(id) = doc.get("id").or(doc.get("_id")).and_then(|v| v.as_str()) {
        let keep_newer = map
          .get(id)
          .map(|existing| {
            let existing_ts = existing
              .get("updated_at")
              .and_then(|v| v.as_i64())
              .unwrap_or(0);
            let new_ts = doc.get("updated_at").and_then(|v| v.as_i64()).unwrap_or(0);
            new_ts > existing_ts
          })
          .unwrap_or(true);

        if keep_newer {
          map.insert(id.to_string(), doc);
        }
      }
    }

    map.into_values().collect()
  }

  #[allow(clippy::too_many_arguments)]
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    cascade_service: CascadeService,
    count_service: Arc<CountService>,
    entity_resolution: Arc<EntityResolutionService>,
    activity_monitor: ActivityMonitorService,
    profile_service: ProfileService,
    app_handle: tauri::AppHandle,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      cascade_service,
      count_service,
      cache_service: CacheService::new(),
      activity_monitor,
      profile_service,
      entity_resolution,
      app_handle,
      spawned_handles: RwLock::new(Vec::new()),
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    let new_cache_service = CacheService::new().with_cache(cache);
    self.cache_service = new_cache_service;
    self
  }

  #[allow(dead_code)]
  fn use_json_provider_for_visibility(visibility: &str) -> bool {
    visibility == "private"
  }

  #[allow(dead_code)]
  fn use_json_provider(&self, table: &str, visibility: Option<&str>, offline: bool) -> bool {
    if offline || table == "daily_activities" {
      return true;
    }
    visibility.unwrap_or("private") == "private"
  }

  fn emit_db_change_event(&self, operation: &str, table: &str, data: &serde_json::Value) {
    let event_name = format!("db-change-{}", table);
    let payload = serde_json::json!({
      "operationType": operation,
      "data": data,
    });
    let _ = self.app_handle.emit(&event_name, payload);
  }

  fn resolve_visibility_for_offline(&self, visibility: Option<String>) -> String {
    visibility.unwrap_or_else(|| "private".to_string())
  }

  async fn get_todo_id_from_task(&self, task_id: &str) -> Option<String> {
    let provider = self.get_provider("tasks", None).ok()?;
    provider
      .find_by_id("tasks", task_id)
      .await
      .ok()
      .flatten()
      .and_then(|task| {
        task
          .get("todo_id")
          .and_then(|v| v.as_str())
          .map(|s| s.to_string())
      })
  }

  async fn load_relations_unified<P: DatabaseProvider + Clone>(
    &self,
    docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
    provider: P,
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() || docs.is_empty() {
      return Ok(docs);
    }

    let segments: Vec<&str> = load_paths.iter().map(|s| s.as_str()).collect();

    let docs_with_meta = add_collection_metadata(docs.clone(), table);

    let loader = RelationLoader::new(provider);

    match loader
      .load_relations_on_docs(docs_with_meta, table, &segments, true)
      .await
    {
      Ok(loaded) => Ok(loaded),
      Err(e) => {
        let err_msg = e.to_string();
        if err_msg.contains("Unknown relation") {
          return Ok(docs);
        }
        Err(err_response_formatted("Relation loading failed", &err_msg))
      }
    }
  }

  fn apply_projection_recursive(&self, docs: Vec<Value>) -> Vec<Value> {
    let projection = security_projection();
    docs
      .into_iter()
      .map(|doc| projection.apply_recursive(&doc))
      .collect()
  }

  fn merge_immutable_fields(existing: &Value, validated: &mut Value) {
    if let (Some(existing_obj), Some(validated_obj)) = (existing.as_object(), validated.as_object())
    {
      let mut merged = validated_obj.clone();
      for (k, v) in existing_obj {
        if k == "id" || k == "created_at" || k == "created_by" || k == "user_id" {
          merged.insert(k.clone(), v.clone());
        }
      }

      let created_at_is_null = merged
        .get("created_at")
        .map(|v| v == &serde_json::Value::Null)
        .unwrap_or(false);

      if created_at_is_null {
        let created_from_existing = existing_obj.get("created_at").cloned();

        if created_from_existing.as_ref() == Some(&serde_json::Value::Null) {
          if let Some(updated_at) = merged.get("updated_at").cloned() {
            if updated_at != serde_json::Value::Null {
              merged.insert("created_at".to_string(), updated_at);
            }
          }
        }

        merged.remove("created_at");
      }

      *validated = serde_json::to_value(merged).unwrap_or_else(|_| validated.clone());
    }
  }

  fn filter_out_deleted(&self, docs: Vec<Value>) -> Vec<Value> {
    crate::helpers::common::filter_deleted(docs)
  }

  fn extract_user_id_from_filter(filter: &Filter) -> Option<String> {
    match filter {
      Filter::And(filters) => {
        for f in filters {
          if let Some(uid) = Self::extract_user_id_from_filter(f) {
            return Some(uid);
          }
        }
        None
      }
      Filter::Eq(key, value) if key == "user_id" => value.as_str().map(|s| s.to_string()),
      _ => None,
    }
  }

  fn extract_task_id_from_filter(filter: &Filter) -> Option<String> {
    match filter {
      Filter::And(filters) => {
        for f in filters {
          if let Some(tid) = Self::extract_task_id_from_filter(f) {
            return Some(tid);
          }
        }
        None
      }
      Filter::Eq(key, value) if key == "task_id" => value.as_str().map(|s| s.to_string()),
      Filter::In(key, values) if key == "task_id" => {
        if values.len() == 1 {
          if let serde_json::Value::String(s) = &values[0] {
            return Some(s.clone());
          }
        }
        None
      }
      _ => None,
    }
  }

  fn filter_contains_field(filter: &Filter, field: &str) -> bool {
    match filter {
      Filter::And(filters) | Filter::Or(filters) => filters
        .iter()
        .any(|f| Self::filter_contains_field(f, field)),
      Filter::Eq(key, _)
      | Filter::In(key, _)
      | Filter::Gte(key, _)
      | Filter::Lte(key, _)
      | Filter::Gt(key, _)
      | Filter::Lt(key, _)
      | Filter::Contains(key, _) => key == field,
      Filter::Not(f) => Self::filter_contains_field(f, field),
      _ => false,
    }
  }

  async fn fix_todo_counts_if_needed(
    &self,
    mut docs: Vec<Value>,
    provider: &DataProvider,
  ) -> Result<Vec<Value>, ResponseModel> {
    let todo_ids: Vec<String> = docs
      .iter()
      .filter_map(|doc| {
        doc
          .get("id")
          .and_then(|v| v.as_str())
          .map(|s| s.to_string())
      })
      .collect();

    if todo_ids.is_empty() {
      return Ok(docs);
    }

    let ids_value: Vec<Value> = todo_ids
      .iter()
      .map(|s| serde_json::Value::String(s.clone()))
      .collect();
    let filter = Filter::In("id".to_string(), ids_value);

    for todo_id in &todo_ids {
      let count_service = self.count_service.as_ref();
      let _ = match provider {
        DataProvider::Json(ap) => {
          count_service
            .refresh_todo_counts(todo_id, ap.as_ref(), true)
            .await
        }
        DataProvider::Mongo(ap) => {
          count_service
            .refresh_todo_counts(todo_id, ap.as_ref(), false)
            .await
        }
        DataProvider::Both(json, mongo) => {
          let a = count_service
            .refresh_todo_counts(todo_id, json.as_ref(), true)
            .await;
          let b = count_service
            .refresh_todo_counts(todo_id, mongo.as_ref(), false)
            .await;
          a.and(b)
        }
      };
    }

    let refreshed = match provider {
      DataProvider::Json(p) => {
        p.find_many("todos", Some(&filter), None, None, None, true)
          .await?
      }
      DataProvider::Mongo(p) => {
        p.find_many("todos", Some(&filter), None, None, None, true)
          .await?
      }
      DataProvider::Both(json, mongo) => {
        let local = json
          .find_many("todos", Some(&filter), None, None, None, true)
          .await?;
        let cloud = mongo
          .find_many("todos", Some(&filter), None, None, None, true)
          .await?;
        Self::merge_documents(local, cloud)
      }
    };

    let refreshed_map: std::collections::HashMap<String, Value> = refreshed
      .into_iter()
      .filter_map(|d| {
        let id = d.get("id").and_then(|v| v.as_str())?.to_string();
        Some((id, d))
      })
      .collect();

    for doc in docs.iter_mut() {
      if let Some(id) = doc.get("id").and_then(|v| v.as_str()).to_owned() {
        if let Some(new_doc) = refreshed_map.get(&id.to_string()) {
          *doc = new_doc.clone();
        }
      }
    }

    Ok(docs)
  }

  #[allow(clippy::too_many_arguments)]
  pub async fn execute(
    &self,
    operation: String,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    filter: Option<Value>,
    load: Option<String>,
    visibility: Option<String>,
    user_id: Option<String>,
    profile_id: Option<String>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let _source = Self::determine_source(visibility.as_deref(), self.mongodb_provider.is_some());

    match operation.as_str() {
      "getAll" => {
        self
          .handle_get_all(
            table, filter, load, visibility, user_id, profile_id, skip, limit,
          )
          .await
      }
      "get" => {
        self
          .handle_get(table, id, load, visibility, filter, user_id)
          .await
      }
      "create" => self.handle_create(table, data, visibility, user_id).await,
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
        let mongodb_available = self.mongodb_provider.is_some();
        let target = match Self::determine_source(visibility.as_deref(), mongodb_available) {
          crate::services::repository::service::DataSource::Local => ProviderType::Json,
          _ => ProviderType::Mongo,
        };
        let id_str = id.ok_or_else(|| err_response("ID required for sync"))?;
        self
          .handle_sync_to_provider(table, id_str, target, visibility)
          .await
      }
      "search" => {
        self
          .handle_search(
            table, filter, load, visibility, user_id, profile_id, skip, limit,
          )
          .await
      }
      _ => Err(err_response(&format!("Unknown operation: {}", operation))),
    }
  }

  async fn handle_get_all(
    &self,
    table: String,
    filter: Option<Value>,
    load: Option<String>,
    visibility: Option<String>,
    user_id: Option<String>,
    profile_id: Option<String>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();
    let _request_id = "unknown".to_string();

    let filter_val = filter.unwrap_or(json!({}));
    let filter_opt =
      if filter_val.is_object() && filter_val.as_object().is_none_or(|obj| obj.is_empty()) {
        None
      } else {
        Filter::from_json(&filter_val).ok()
      };

    let visibility_str = self.resolve_visibility_for_offline(visibility);

    let provider = self.get_provider(&table, Some(&visibility_str))?;

    let load_paths = parse_load_param(load);

    let load_paths = if table == "chats" && load_paths.is_empty() {
      vec!["sender".to_string()]
    } else {
      load_paths
    };

    let final_filter = if table == "todos" {
      let permission_filter_json = PermissionService::get_todo_filter_for_user(
        user_id.as_deref().unwrap_or(""),
        profile_id.as_deref(),
        Some(&visibility_str),
      );
      let permission_filter = Filter::from_json(&permission_filter_json).ok();
      match (permission_filter, filter_opt) {
        (Some(perm), Some(existing)) => Some(Filter::And(vec![perm, existing])),
        (Some(perm), None) => Some(perm),
        (None, existing) => existing,
      }
    } else if table == "tasks" {
      let uid = user_id.as_deref().unwrap_or("");
      let visibility_is_private = visibility_str == "private";

      let todos_filter_json = PermissionService::get_todo_filter_for_user(
        user_id.as_deref().unwrap_or(""),
        profile_id.as_deref(),
        Some(&visibility_str),
      );
      let todos_filter = Filter::from_json(&todos_filter_json).ok();
      let todo_ids: Vec<String> = if let Some(filter) = todos_filter {
        match provider
          .find_many("todos", Some(&filter), None, None, None, true)
          .await
        {
          Ok(todos) => todos
            .iter()
            .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect(),
          Err(_) => vec![],
        }
      } else {
        vec![]
      };

      if visibility_is_private {
        let filter_user_id = filter_opt
          .as_ref()
          .and_then(|f| Self::extract_user_id_from_filter(f));
        if let Some(fuid) = filter_user_id {
          if fuid != uid {
            return Err(err_response("Unauthorized: user_id mismatch"));
          }
        }
        if todo_ids.is_empty() {
          return Ok(success_response(DataValue::Array(vec![])));
        }
        let todo_in_filter = Filter::In(
          "todo_id".to_string(),
          todo_ids.into_iter().map(Value::String).collect(),
        );
        let user_id_check = Filter::Eq("user_id".to_string(), Value::String(uid.to_string()));
        Some(Filter::And(vec![todo_in_filter, user_id_check]))
      } else {
        if todo_ids.is_empty() {
          return Ok(success_response(DataValue::Array(vec![])));
        }
        let todo_in_filter = Filter::In(
          "todo_id".to_string(),
          todo_ids.into_iter().map(Value::String).collect(),
        );

        let should_override_filter =
          matches!(visibility_str.as_str(), "public" | "shared" | "cloud");

        if should_override_filter {
          let has_conflicting_filter = filter_opt
            .as_ref()
            .map(|f| {
              Self::filter_contains_field(f, "todo_id") || Self::filter_contains_field(f, "$or")
            })
            .unwrap_or(false);

          if has_conflicting_filter {
            Some(todo_in_filter)
          } else {
            match filter_opt {
              Some(existing) => Some(Filter::And(vec![todo_in_filter, existing])),
              None => Some(todo_in_filter),
            }
          }
        } else {
          match filter_opt {
            Some(existing) => Some(Filter::And(vec![todo_in_filter, existing])),
            None => Some(todo_in_filter),
          }
        }
      }
    } else if table == "categories" {
      let category_filter_json = match visibility_str.as_str() {
        "local" | "private" => {
          json!({ "visibility": "private", "user_id": user_id.as_deref().unwrap_or("") })
        }
        "cloud" | "shared" => {
          json!({
            "$or": [
              { "visibility": "shared", "user_id": user_id.as_deref().unwrap_or("") },
              { "visibility": "public" }
            ]
          })
        }
        "all" => {
          json!({
            "$or": [
              { "visibility": "private", "user_id": user_id.as_deref().unwrap_or("") },
              { "visibility": "shared", "user_id": user_id.as_deref().unwrap_or("") },
              { "visibility": "public" }
            ]
          })
        }
        _ => json!({ "visibility": "private", "user_id": user_id.as_deref().unwrap_or("") }),
      };
      let category_filter = Filter::from_json(&category_filter_json).ok();
      match (category_filter, filter_opt) {
        (Some(cat_f), Some(existing)) => Some(Filter::And(vec![cat_f, existing])),
        (Some(cat_f), None) => Some(cat_f),
        (None, existing) => existing,
      }
    } else if table == "subtasks" || table == "comments" {
      let uid = user_id.as_deref().unwrap_or("");
      let visibility_is_private = visibility_str == "private";

      let specific_task_id = filter_opt
        .as_ref()
        .and_then(|f| Self::extract_task_id_from_filter(f));

      if let Some(task_id) = specific_task_id {
        let task_filter = Filter::Eq("id".to_string(), Value::String(task_id.clone()));

        let task_opt = match provider
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          Ok(tasks) => tasks.first().cloned(),
          Err(_) => None,
        };

        if let Some(task) = task_opt {
          let todo_id = task.get("todo_id").and_then(|v| v.as_str());
          if let Some(tid) = todo_id {
            let todo_filter = Filter::Eq("id".to_string(), Value::String(tid.to_string()));
            let todo_opt = match provider
              .find_many("todos", Some(&todo_filter), None, None, None, true)
              .await
            {
              Ok(todos) => todos.first().cloned(),
              Err(_) => None,
            };

            if let Some(todo) = todo_opt {
              let can_view = PermissionService::can_view_todo(&todo, uid);
              if !can_view {
                return Err(err_response("Unauthorized: access denied to this task"));
              }
            } else {
              return Err(err_response("Unauthorized: todo not found"));
            }
          } else {
            return Err(err_response("Unauthorized: task has no parent todo"));
          }
        } else {
          let mut found_todo_id: Option<String> = None;

          if let Ok(Some(task)) = self.json_provider.find_by_id("tasks", &task_id).await {
            found_todo_id = task
              .get("todo_id")
              .and_then(|v| v.as_str())
              .map(|s| s.to_string());
          }

          if found_todo_id.is_none() {
            if let Some(mongo_provider) = &self.mongodb_provider {
              if let Ok(Some(task)) = mongo_provider.find_by_id("tasks", &task_id).await {
                found_todo_id = task
                  .get("todo_id")
                  .and_then(|v| v.as_str())
                  .map(|s| s.to_string());
              }
            }
          }

          if let Some(todo_id) = found_todo_id {
            let can_view = if visibility_str == "private" || visibility_str == "local" {
              if let Ok(Some(todo)) = self.json_provider.find_by_id("todos", &todo_id).await {
                PermissionService::can_view_todo(&todo, uid)
              } else {
                false
              }
            } else {
              if let Some(mongo) = &self.mongodb_provider {
                if let Ok(Some(todo)) = mongo.find_by_id("todos", &todo_id).await {
                  PermissionService::can_view_todo(&todo, uid)
                } else {
                  false
                }
              } else {
                false
              }
            };

            if !can_view {
              return Err(err_response("Unauthorized: access denied to this task"));
            }
          } else {
            return Err(err_response("Unauthorized: task not found"));
          }
        }
      }

      if visibility_is_private {
        let filter_user_id = filter_opt
          .as_ref()
          .and_then(|f| Self::extract_user_id_from_filter(f));
        if let Some(fuid) = filter_user_id {
          if fuid != uid {
            return Err(err_response("Unauthorized: user_id mismatch"));
          }
        }
      }

      let todos_filter_json = PermissionService::get_todo_filter_for_user(
        user_id.as_deref().unwrap_or(""),
        profile_id.as_deref(),
        Some(&visibility_str),
      );
      let todos_filter = Filter::from_json(&todos_filter_json).ok();
      let todo_ids: Vec<String> = if let Some(filter) = todos_filter {
        match provider
          .find_many("todos", Some(&filter), None, None, None, true)
          .await
        {
          Ok(todos) => todos
            .iter()
            .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect(),
          Err(_) => vec![],
        }
      } else {
        vec![]
      };

      if todo_ids.is_empty() {
        filter_opt
      } else {
        let task_filter = Filter::In(
          "todo_id".to_string(),
          todo_ids.into_iter().map(Value::String).collect(),
        );
        match provider
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          Ok(tasks) => {
            let task_ids: Vec<String> = tasks
              .iter()
              .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
              .collect();
            if task_ids.is_empty() {
              Some(Filter::Eq(
                "task_id".to_string(),
                Value::String("".to_string()),
              ))
            } else {
              let entity_field = "task_id";
              let in_filter = Filter::In(
                entity_field.to_string(),
                task_ids.into_iter().map(Value::String).collect(),
              );
              match filter_opt {
                Some(existing) => Some(Filter::And(vec![in_filter, existing])),
                None => Some(in_filter),
              }
            }
          }
          Err(_) => Some(Filter::Eq(
            "task_id".to_string(),
            Value::String("".to_string()),
          )),
        }
      }
    } else if table == "chats" {
      let uid = user_id.as_deref().unwrap_or("");
      let sender_filter = Filter::Eq("sender_id".to_string(), Value::String(uid.to_string()));
      match filter_opt {
        Some(existing) => Some(Filter::And(vec![sender_filter, existing])),
        None => Some(sender_filter),
      }
    } else if table == "profiles" || table == "users" {
      // Only filter by user_id for private visibility (own profiles)
      // For public/all visibility, return all profiles without user_id filtering
      if visibility_str == "private" {
        if let Some(uid) = user_id.as_deref().filter(|u| !u.is_empty()) {
          let user_field = if table == "profiles" { "user_id" } else { "id" };
          let user_filter = Filter::Eq(user_field.to_string(), Value::String(uid.to_string()));
          match filter_opt {
            Some(existing) => Some(Filter::And(vec![user_filter, existing])),
            None => Some(user_filter),
          }
        } else {
          filter_opt
        }
      } else {
        filter_opt // public/all visibility - no user_id filter
      }
    } else if table == "daily_activities" {
      let uid = user_id.as_deref().unwrap_or("");
      let user_filter = Filter::Eq("user_id".to_string(), Value::String(uid.to_string()));
      match filter_opt {
        Some(existing) => Some(Filter::And(vec![user_filter, existing])),
        None => Some(user_filter),
      }
    } else {
      filter_opt
    };

    let (docs, used_json_fallback) = match &provider {
      DataProvider::Both(json, mongo) => {
        let mut local_docs = Vec::new();
        let mut cloud_docs = Vec::new();

        if let Ok(docs) = json
          .find_many(&table, final_filter.as_ref(), skip, limit, None, true)
          .await
        {
          local_docs = docs;
        }

        if let Ok(docs) = mongo
          .find_many(&table, final_filter.as_ref(), skip, limit, None, true)
          .await
        {
          cloud_docs = docs;
        }

        (Self::merge_documents(local_docs, cloud_docs), false)
      }
      _ => {
        match provider
          .find_many(&table, final_filter.as_ref(), skip, limit, None, true)
          .await
        {
          Ok(docs) => (docs, false),
          Err(_) => {
            let json_provider = DataProvider::Json(Arc::new(self.json_provider.clone()));
            let docs = json_provider
              .find_many(&table, final_filter.as_ref(), skip, limit, None, true)
              .await?;
            (docs, true)
          }
        }
      }
    };

    let use_json_only = matches!(&provider, DataProvider::Json(_)) || used_json_fallback;

    let docs = if !load_paths.is_empty() {
      match &provider {
        DataProvider::Json(p) => {
          self
            .load_relations_unified(docs, &table, &load_paths, (**p).clone())
            .await?
        }
        DataProvider::Mongo(p) => {
          self
            .load_relations_unified(docs, &table, &load_paths, (**p).clone())
            .await?
        }
        DataProvider::Both(json, mongo) => {
          let local = json
            .find_many(&table, None, None, None, None, true)
            .await
            .unwrap_or_default();
          let cloud = mongo
            .find_many(&table, None, None, None, None, true)
            .await
            .unwrap_or_default();
          let merged = Self::merge_documents(local, cloud);
          self
            .load_relations_unified(merged, &table, &load_paths, json.as_ref().clone())
            .await?
        }
      }
    } else {
      strip_relation_fields(docs, &table)
    };

    let docs = if table == "todos" {
      self.fix_todo_counts_if_needed(docs, &provider).await?
    } else {
      docs
    };

    let docs = if use_json_only {
      docs
    } else {
      self.filter_out_deleted(docs)
    };

    let _elapsed = start.elapsed();

    Ok(success_response(DataValue::Array(
      self.apply_projection_recursive(docs),
    )))
  }

  async fn handle_search(
    &self,
    table: String,
    filter: Option<Value>,
    load: Option<String>,
    visibility: Option<String>,
    user_id: Option<String>,
    profile_id: Option<String>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let search_query = filter
      .as_ref()
      .and_then(|f| f.get("query"))
      .and_then(|q| q.as_str())
      .unwrap_or("");

    let visibility_str = self.resolve_visibility_for_offline(visibility);
    let provider = self.get_provider(&table, Some(&visibility_str))?;

    let load_paths = parse_load_param(load);

    let search_filter = if !search_query.is_empty() {
      let search_regex = serde_json::json!({
        "$regex": search_query,
        "$options": "i"
      });

      let filter_json = match table.as_str() {
        "todos" | "tasks" | "subtasks" | "comments" | "chats" | "categories" => {
          if table == "todos" {
            let permission_filter_json = PermissionService::get_todo_filter_for_user(
              user_id.as_deref().unwrap_or(""),
              profile_id.as_deref(),
              Some(&visibility_str),
            );
            serde_json::json!({
              "$and": [
                permission_filter_json,
                {
                  "$or": [
                    { "title": search_regex },
                    { "description": search_regex }
                  ]
                }
              ]
            })
          } else if table == "tasks" || table == "subtasks" || table == "comments" {
            let uid = user_id.as_deref().unwrap_or("");
            let visibility_is_private = visibility_str == "private";

            // Security check for private visibility
            if visibility_is_private {
              if let Some(f) = filter.as_ref() {
                if let Some(fuid) = f.get("user_id").and_then(|v| v.as_str()) {
                  if fuid != uid {
                    return Err(err_response("Unauthorized: user_id mismatch"));
                  }
                }
              }
            }

            // Get accessible todo_ids via permission filter
            let todos_filter_json = PermissionService::get_todo_filter_for_user(
              user_id.as_deref().unwrap_or(""),
              profile_id.as_deref(),
              Some(&visibility_str),
            );
            let todos_filter = Filter::from_json(&todos_filter_json).ok();
            let todo_ids: Vec<String> = if let Some(filter) = todos_filter {
              match provider
                .find_many("todos", Some(&filter), None, None, None, true)
                .await
              {
                Ok(todos) => todos
                  .iter()
                  .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                  .collect(),
                Err(_) => vec![],
              }
            } else {
              vec![]
            };

            if todo_ids.is_empty() {
              serde_json::json!({
                "$and": [
                  { "todo_id": "" },
                  { "title": search_regex }
                ]
              })
            } else {
              let todo_in_filter = json!({
                "todo_id": { "$in": todo_ids }
              });
              let title_filter = json!({ "title": search_regex });

              if visibility_is_private {
                let user_id_check = json!({ "user_id": uid });
                serde_json::json!({
                  "$and": [todo_in_filter, user_id_check, title_filter]
                })
              } else {
                serde_json::json!({
                  "$and": [todo_in_filter, title_filter]
                })
              }
            }
          } else if table == "chats" {
            let uid = user_id.as_deref().unwrap_or("");
            serde_json::json!({
              "$and": [
                { "sender_id": uid },
                {
                  "$or": [
                    { "title": search_regex },
                    { "message": search_regex }
                  ]
                }
              ]
            })
          } else {
            serde_json::json!({
              "$or": [
                { "title": search_regex },
                { "description": search_regex }
              ]
            })
          }
        }
        "profiles" => {
          serde_json::json!({
            "$or": [
              { "name": search_regex },
              { "last_name": search_regex },
              { "email": search_regex },
              { "user.username": search_regex }
            ]
          })
        }
        _ => {
          serde_json::json!({
            "title": search_regex
          })
        }
      };

      Filter::from_json(&filter_json).ok()
    } else {
      None
    };

    let (docs, used_json_fallback) = match &provider {
      DataProvider::Both(json, mongo) => {
        let local_docs = json
          .find_many(&table, search_filter.as_ref(), skip, limit, None, true)
          .await
          .unwrap_or_default();
        let cloud_docs = mongo
          .find_many(&table, search_filter.as_ref(), skip, limit, None, true)
          .await
          .unwrap_or_default();
        (Self::merge_documents(local_docs, cloud_docs), false)
      }
      _ => match provider
        .find_many(&table, search_filter.as_ref(), skip, limit, None, true)
        .await
      {
        Ok(docs) => {
          if docs.is_empty() && visibility_str == "all" {
            let json_provider = DataProvider::Json(Arc::new(self.json_provider.clone()));
            match json_provider
              .find_many(&table, search_filter.as_ref(), skip, limit, None, true)
              .await
            {
              Ok(json_docs) => (json_docs, true),
              Err(_) => (docs, false),
            }
          } else {
            (docs, false)
          }
        }
        Err(_e) => {
          let json_provider = DataProvider::Json(Arc::new(self.json_provider.clone()));
          let docs = json_provider
            .find_many(&table, search_filter.as_ref(), skip, limit, None, true)
            .await?;
          (docs, true)
        }
      },
    };

    let use_json_only = match &provider {
      DataProvider::Json(_) | DataProvider::Both(_, _) => true,
      DataProvider::Mongo(_) => used_json_fallback,
    };

    let docs = if !load_paths.is_empty() {
      match &provider {
        DataProvider::Json(p) => {
          self
            .load_relations_unified(docs, &table, &load_paths, (**p).clone())
            .await?
        }
        DataProvider::Mongo(p) => {
          self
            .load_relations_unified(docs, &table, &load_paths, (**p).clone())
            .await?
        }
        DataProvider::Both(json, mongo) => {
          let merged = Self::merge_documents(
            json
              .find_many(&table, None, None, None, None, true)
              .await
              .unwrap_or_default(),
            mongo
              .find_many(&table, None, None, None, None, true)
              .await
              .unwrap_or_default(),
          );
          self
            .load_relations_unified(merged, &table, &load_paths, json.as_ref().clone())
            .await?
        }
      }
    } else {
      strip_relation_fields(docs, &table)
    };

    let docs = if use_json_only || visibility_str == "private" {
      docs
    } else {
      self.filter_out_deleted(docs)
    };

    let _elapsed = start.elapsed();

    Ok(success_response(DataValue::Array(
      self.apply_projection_recursive(docs),
    )))
  }

  async fn handle_get(
    &self,
    table: String,
    id: Option<String>,
    load: Option<String>,
    visibility: Option<String>,
    filter: Option<Value>,
    user_id: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let visibility_str = self.resolve_visibility_for_offline(visibility.clone());

    // For get by ID without explicit visibility (None defaults to "private"),
    // check both providers since document might be in either JSON or MongoDB
    let use_both_providers = visibility.is_none();
    let provider = if use_both_providers {
      self.get_provider(&table, Some("all"))?
    } else {
      self.get_provider(&table, Some(&visibility_str))?
    };

    let docs: Vec<Value> = if let Some(ref id_val) = id {
      match &provider {
        DataProvider::Both(json, mongo) => {
          // Check JSON first, then MongoDB
          if let Ok(Some(d)) = json.find_by_id(&table, id_val).await {
            vec![d]
          } else if let Ok(Some(d)) = mongo.find_by_id(&table, id_val).await {
            vec![d]
          } else {
            // If not found by ID, try filter as fallback
            if let Some(f) = &filter {
              let filter_obj = nosql_orm::query::Filter::from_json(f)
                .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
              let json_docs = json
                .find_many(&table, Some(&filter_obj), None, None, None, true)
                .await
                .unwrap_or_default();
              let mongo_docs = mongo
                .find_many(&table, Some(&filter_obj), None, None, None, true)
                .await
                .unwrap_or_default();
              let combined = Self::merge_documents(json_docs, mongo_docs);
              if combined.len() == 1 {
                combined
              } else if combined.is_empty() {
                return Err(err_response("Document not found"));
              } else {
                return Err(err_response("Multiple documents found, use getAll instead"));
              }
            } else {
              return Err(err_response("Document not found"));
            }
          }
        }
        _ => {
          // Single provider - try find_by_id first
          match provider.find_by_id(&table, id_val).await? {
            Some(d) => vec![d],
            None => {
              // Fallback: try filter if provided, or check the other provider if we have access to both
              if let Some(f) = &filter {
                let filter_obj = nosql_orm::query::Filter::from_json(f)
                  .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
                provider
                  .find_many(&table, Some(&filter_obj), None, None, None, true)
                  .await?
              } else if use_both_providers {
                // visibility was None - we might be using wrong provider, try the other one
                let _json_provider = self.json_provider.clone();
                let mongo_provider = self.mongodb_provider.clone();
                if visibility_str == "private" {
                  // We used "all" but fell through here - try mongo directly
                  if let Some(mongo) = mongo_provider {
                    match mongo.find_by_id(&table, id_val).await {
                      Ok(Some(d)) => return Ok(success_response(DataValue::Object(d))),
                      _ => {}
                    }
                  }
                }
                return Err(err_response("Document not found"));
              } else {
                return Err(err_response("Document not found"));
              }
            }
          }
        }
      }
    } else if let Some(f) = &filter {
      let filter_obj = nosql_orm::query::Filter::from_json(f)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
      let filter_docs = provider
        .find_many(&table, Some(&filter_obj), None, None, None, true)
        .await?;

      if filter_docs.len() == 1 {
        filter_docs
      } else if filter_docs.is_empty() {
        return Err(err_response("Document not found"));
      } else {
        return Err(err_response("Multiple documents found, use getAll instead"));
      }
    } else {
      return Err(err_response("ID or filter is required for get operation"));
    };

    let load_paths = parse_load_param(load);

    let docs = if !load_paths.is_empty() {
      match &provider {
        DataProvider::Json(p) => {
          self
            .load_relations_unified(docs, &table, &load_paths, (**p).clone())
            .await?
        }
        DataProvider::Mongo(p) => {
          self
            .load_relations_unified(docs, &table, &load_paths, (**p).clone())
            .await?
        }
        DataProvider::Both(json, _mongo) => {
          self
            .load_relations_unified(docs, &table, &load_paths, json.as_ref().clone())
            .await?
        }
      }
    } else {
      strip_relation_fields(docs, &table)
    };

    let docs = if table == "todos" {
      self.fix_todo_counts_if_needed(docs, &provider).await?
    } else {
      docs
    };

    let projected = self.apply_projection_recursive(docs);

    if table == "todos" {
      if let Some(user) = &user_id {
        for doc in &projected {
          if !PermissionService::can_view_todo(doc, user) {
            return Err(err_response(
              "Unauthorized: You do not have permission to view this todo",
            ));
          }
        }
      }
    }

    let _elapsed = start.elapsed();

    if id.is_some() {
      if !projected.is_empty() {
        Ok(success_response(DataValue::Object(
          projected
            .into_iter()
            .next()
            .expect("Empty iterator after non-empty check"),
        )))
      } else {
        Err(err_response("Document not found after projection"))
      }
    } else {
      Ok(success_response(DataValue::Array(projected)))
    }
  }

  async fn handle_create(
    &self,
    table: String,
    data: Option<Value>,
    visibility: Option<String>,
    user_id: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let mut data_val = data.ok_or_else(|| err_response("Data required for create"))?;

    let visibility_str = if visibility.is_some() {
      self.resolve_visibility_for_offline(visibility)
    } else if let Some(serde_json::Value::String(vis_from_data)) = data_val.get("visibility") {
      vis_from_data.clone()
    } else {
      self.resolve_visibility_for_offline(visibility)
    };

    let provider = self.get_provider(&table, Some(&visibility_str))?;

    if table == "todos" || table == "categories" {
      if let serde_json::Value::Object(ref mut obj) = data_val {
        obj.insert(
          "visibility".to_string(),
          serde_json::Value::String(visibility_str.clone()),
        );
      }
    }

    // For tasks, subtasks, and comments - inherit visibility from parent todo
    let parent_todo_visibility: Option<String> = if table == "tasks" {
      // Task directly has todo_id
      let todo_id = data_val.get("todo_id").and_then(|v| v.as_str());
      if let Some(tid) = todo_id {
        let todo_provider = self.get_provider("todos", Some(&visibility_str)).ok();
        if let Some(provider) = todo_provider {
          let todo = provider.find_by_id("todos", tid).await.ok().flatten();
          todo.and_then(|t| {
            t.get("visibility")
              .and_then(|v| v.as_str())
              .map(|s| s.to_string())
          })
        } else {
          None
        }
      } else {
        None
      }
    } else {
      // Subtask or comment - need to look up task first to get todo_id
      let task_id = data_val.get("task_id").and_then(|v| v.as_str());
      if let Some(tid) = task_id {
        let task_provider = self.get_provider("tasks", Some(&visibility_str)).ok();
        if let Some(provider) = task_provider {
          let task = provider.find_by_id("tasks", tid).await.ok().flatten();
          if let Some(task) = task {
            let todo_id = task.get("todo_id").and_then(|v| v.as_str());
            if let Some(tid) = todo_id {
              let todo_provider = self.get_provider("todos", Some(&visibility_str)).ok();
              if let Some(provider) = todo_provider {
                let todo = provider.find_by_id("todos", tid).await.ok().flatten();
                todo.and_then(|t| {
                  t.get("visibility")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                })
              } else {
                None
              }
            } else {
              None
            }
          } else {
            None
          }
        } else {
          None
        }
      } else {
        None
      }
    };

    // Inject visibility into the data if we found a parent todo with visibility
    if let Some(todo_vis) = parent_todo_visibility {
      if let serde_json::Value::Object(ref mut obj) = data_val {
        obj.insert(
          "visibility".to_string(),
          serde_json::Value::String(todo_vis),
        );
      }
    }

    if table == "tasks" || table == "subtasks" || table == "comments" {
      if let Some(uid) = user_id.as_ref() {
        if table == "tasks" || table == "subtasks" {
          let todo_id_opt: Option<String> = if table == "tasks" {
            data_val
              .get("todo_id")
              .and_then(|v| v.as_str())
              .map(|s| s.to_string())
          } else {
            let task_id = data_val.get("task_id").and_then(|v| v.as_str());
            if let Some(tid) = task_id {
              self.get_todo_id_from_task(tid).await
            } else {
              None
            }
          };

          if let Some(todo_id) = todo_id_opt {
            let todo = provider.find_by_id("todos", &todo_id).await.ok().flatten();
            if let Some(todo) = todo {
              if !crate::services::permission_service::PermissionService::can_add_task_to_todo(
                &todo, uid,
              ) {
                return Err(err_response(
                  "Unauthorized: You do not have permission to add content to this todo",
                ));
              }
            }
          }
        } else if table == "comments" {
          let task_id = data_val.get("task_id").and_then(|v| v.as_str());
          if let Some(task_id) = task_id {
            if let Some(task) = provider.find_by_id("tasks", task_id).await.ok().flatten() {
              let todo_id = task.get("todo_id").and_then(|v| v.as_str());
              if let Some(todo_id) = todo_id {
                if let Some(todo) = provider.find_by_id("todos", todo_id).await.ok().flatten() {
                  let permission =
                    crate::services::permission_service::PermissionService::get_todo_permission(
                      &todo, uid,
                    );
                  if permission.map(|p| p.can_create_comment()).unwrap_or(false) {
                  } else {
                    return Err(err_response(
                      "Unauthorized: You do not have permission to add comments to this todo",
                    ));
                  }
                }
              }
            }
          }
        }
      }
    }

    let validated_data = validate_model(&table, &data_val, true, Some(visibility_str.clone()))
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let created_record = provider.insert(&table, validated_data).await?;

    self.cache_service.invalidate_collection(&table).await;

    if table == "profiles" {
      if let Some(profile_id) = created_record.get("id").and_then(|v| v.as_str()) {
        if let Some(user_id) = created_record.get("user_id").and_then(|v| v.as_str()) {
          let profile_id_clone = profile_id.to_string();
          let profile_service = self.profile_service.clone();
          let json_provider = self.json_provider.clone();
          let mongo_provider = self.mongodb_provider.clone();
          let user_id_clone = user_id.to_string();
          let handle = tokio::spawn(async move {
            let _ = profile_service
              .sync_profile_to_cloud(profile_id_clone.clone())
              .await;
            let _ = user_sync_helper::update_user_profile_id_both(
              &json_provider,
              mongo_provider.as_ref(),
              &user_id_clone,
              &profile_id_clone,
            )
            .await;
          });
          if let Ok(mut handles) = self.spawned_handles.write() {
            handles.push(handle);
          }
        }
      }
    } else if table == "tasks" {
      if let Some(todo_id) = created_record.get("todo_id").and_then(|v| v.as_str()) {
        let count_service = self.count_service.clone();
        let todo_id_clone = todo_id.to_string();
        let handle = tokio::spawn(async move {
          let _ = count_service.on_task_created(&todo_id_clone).await;
        });
        if let Ok(mut handles) = self.spawned_handles.write() {
          handles.push(handle);
        }
      }
    } else if table == "subtasks" {
      if let Some(task_id) = created_record.get("task_id").and_then(|v| v.as_str()) {
        let count_service = self.count_service.clone();
        let task_id_clone = task_id.to_string();
        let todo_id_opt = self.get_todo_id_from_task(&task_id_clone).await;
        if let Some(todo_id) = todo_id_opt {
          let todo_id_clone = todo_id.to_string();
          let handle = tokio::spawn(async move {
            let _ = count_service
              .on_subtask_created(&task_id_clone, &todo_id_clone)
              .await;
          });
          if let Ok(mut handles) = self.spawned_handles.write() {
            handles.push(handle);
          }
        }
      }
    } else if table == "comments" {
      let task_id = created_record.get("task_id").and_then(|v| v.as_str());
      let subtask_id = created_record
        .get("subtask_id")
        .and_then(|v: &Value| v.as_str());
      let count_service = self.count_service.clone();
      let task_id_clone = task_id.map(|s| s.to_string());
      let subtask_id_clone = subtask_id.map(|s| s.to_string());
      let visibility_clone = visibility_str.clone();

      if let Some(ref _sid) = subtask_id_clone {
        let _cid = created_record
          .get("id")
          .and_then(|v| v.as_str())
          .unwrap_or("unknown");
      }

      let handle = tokio::spawn(async move {
        let _ = count_service
          .on_comment_created(
            task_id_clone.as_deref(),
            subtask_id_clone.as_deref(),
            &visibility_clone,
          )
          .await;
      });
      if let Ok(mut handles) = self.spawned_handles.write() {
        handles.push(handle);
      }
    }

    let _ = self
      .activity_monitor
      .log_action(&table, "create", &created_record, None)
      .await;

    let should_publish_to_github = table == "tasks"
      && created_record
        .get("publish_to_github")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut final_record = created_record.clone();

    if should_publish_to_github {
      if let Ok(updated) = self
        .handle_github_publish_for_task(created_record.clone(), visibility_str.clone())
        .await
      {
        final_record = updated;
      }
    }

    if table == "comments" {
      if let Ok(updated) = self
        .handle_github_sync_comment(created_record, visibility_str)
        .await
      {
        final_record = updated;
      }
    }

    let projection = security_projection();
    let response_doc = projection.apply_recursive(&final_record);
    let _elapsed = start.elapsed();
    let _created_id = final_record
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or("unknown");

    self.emit_db_change_event("created", &table, &response_doc);

    Ok(success_response(DataValue::Object(response_doc)))
  }

  async fn handle_github_sync_comment(
    &self,
    comment_record: Value,
    visibility: String,
  ) -> Result<Value, ResponseModel> {
    let task_id = match comment_record.get("task_id").and_then(|v| v.as_str()) {
      Some(id) => id,
      None => return Ok(comment_record),
    };

    let provider = self.get_provider("tasks", Some(&visibility))?;
    let task = match provider.find_by_id("tasks", task_id).await? {
      Some(t) => t,
      None => return Ok(comment_record),
    };

    let github_issue_id = match task.get("github_issue_id").and_then(|v| v.as_i64()) {
      Some(id) => id,
      _ => return Ok(comment_record),
    };

    let github_issue_url = task
      .get("github_issue_url")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if github_issue_url.is_empty() {
      return Ok(comment_record);
    }

    let repo_url = github_issue_url;
    let parts: Vec<&str> = repo_url.trim_end_matches('/').split('/').collect();
    if parts.len() < 2 {
      return Ok(comment_record);
    }
    let repo_owner = parts[parts.len() - 4];
    let repo_name = parts[parts.len() - 3];

    let comment_content = comment_record
      .get("content")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    let user_id = comment_record
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let access_token = self
      .get_user_github_token(user_id)
      .await
      .unwrap_or_default();

    if access_token.is_empty() {
      return Ok(comment_record);
    }

    use crate::services::github_service::GithubService;
    let github_service = GithubService::new();

    let gh_comment = github_service
      .create_comment(
        &access_token,
        repo_owner,
        repo_name,
        github_issue_id,
        comment_content,
      )
      .await?;

    let mut updated_record = comment_record.clone();
    if let Some(obj) = updated_record.as_object_mut() {
      obj.insert(
        "github_comment_id".to_string(),
        serde_json::json!(gh_comment.id),
      );
      obj.insert(
        "github_issue_id".to_string(),
        serde_json::json!(github_issue_id),
      );
    }

    let comment_id = comment_record
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let _ = provider
      .update("comments", comment_id, updated_record.clone())
      .await;

    Ok(updated_record)
  }

  async fn handle_github_publish_for_task(
    &self,
    task_record: Value,
    visibility: String,
  ) -> Result<Value, ResponseModel> {
    let todo_id = match task_record.get("todo_id").and_then(|v| v.as_str()) {
      Some(id) => id,
      None => return Ok(task_record),
    };

    let provider = self.get_provider("todos", Some(&visibility))?;
    let todo = match provider.find_by_id("todos", todo_id).await? {
      Some(t) => t,
      None => return Ok(task_record),
    };

    let _github_repo_id = match todo.get("github_repo_id").and_then(|v| v.as_str()) {
      Some(id) if !id.is_empty() => id,
      _ => return Ok(task_record),
    };

    let github_repo_name = todo
      .get("github_repo_name")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    let parts: Vec<&str> = github_repo_name.split('/').collect();
    if parts.len() != 2 {
      return Ok(task_record);
    }
    let repo_owner = parts[0];
    let repo_name = parts[1];

    let task_title = task_record
      .get("title")
      .and_then(|v| v.as_str())
      .unwrap_or("Task");
    let task_description = task_record
      .get("description")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let task_priority = task_record
      .get("priority")
      .and_then(|v| v.as_str())
      .unwrap_or("medium");
    let task_end_date = task_record
      .get("end_date")
      .and_then(|v| v.as_str())
      .unwrap_or("");

    let issue_body = format!(
      "**Task Details**\n\n**Description:** {}\n\n**Priority:** {}\n**Due Date:** {}\n**Created in:** TaskFlow\n\n---\n[View in TaskFlow](taskflow://tasks/{})",
      task_description,
      task_priority,
      task_end_date,
      task_record.get("id").and_then(|v| v.as_str()).unwrap_or("")
    );

    use crate::services::github_service::GithubService;
    let github_service = GithubService::new();

    let user_id = task_record
      .get("user_id")
      .and_then(|v| v.as_str())
      .unwrap_or("");
    let access_token = self
      .get_user_github_token(user_id)
      .await
      .unwrap_or_default();

    if access_token.is_empty() {
      return Ok(task_record);
    }

    let issue = github_service
      .create_issue(
        &access_token,
        repo_owner,
        repo_name,
        task_title,
        &issue_body,
      )
      .await?;

    let mut updated_record = task_record.clone();
    if let Some(obj) = updated_record.as_object_mut() {
      obj.insert("github_issue_id".to_string(), serde_json::json!(issue.id));
      obj.insert(
        "github_issue_url".to_string(),
        serde_json::json!(issue.html_url),
      );
    }

    let task_id = task_record.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let _ = provider
      .update("tasks", task_id, updated_record.clone())
      .await;

    if let Ok(subtasks) = self.get_subtasks_for_task(task_id, &visibility).await {
      for (index, subtask) in subtasks.into_iter().enumerate() {
        let subtask_title = subtask
          .get("title")
          .and_then(|v: &serde_json::Value| v.as_str())
          .unwrap_or("");
        let comment_body = format!("**Subtask {}:** {}", index + 1, subtask_title);
        let _ = github_service
          .create_comment(
            &access_token,
            repo_owner,
            repo_name,
            issue.number,
            &comment_body,
          )
          .await;
      }
    }

    Ok(updated_record)
  }

  async fn get_user_github_token(&self, user_id: &str) -> Result<String, ResponseModel> {
    let table_name = "users";
    let filter = nosql_orm::query::Filter::Eq("id".to_string(), serde_json::json!(user_id));

    let user_val = self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
      .map_err(|e| err_response(&format!("Database error: {}", e)))?
      .into_iter()
      .next()
      .ok_or_else(|| err_response("User not found"))?;

    let user: crate::entities::user_entity::UserEntity =
      serde_json::from_value(user_val).map_err(|e| err_response(&format!("Parse error: {}", e)))?;

    Ok(user.github_access_token)
  }

  async fn get_subtasks_for_task(
    &self,
    task_id: &str,
    visibility: &str,
  ) -> Result<Vec<Value>, ResponseModel> {
    let provider = self.get_provider("subtasks", Some(visibility))?;
    let filter = nosql_orm::query::Filter::Eq("task_id".to_string(), serde_json::json!(task_id));
    provider
      .find_many("subtasks", Some(&filter), None, None, None, true)
      .await
  }

  async fn handle_update_all(
    &self,
    table: String,
    data: Option<Value>,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let data_val = data.ok_or_else(|| err_response("Data required for updateAll"))?;

    let raw_records = data_val
      .as_array()
      .ok_or_else(|| err_response("Data must be an array for updateAll"))?
      .clone();

    let mut validated_records: Vec<Value> = Vec::with_capacity(raw_records.len());
    let visibility_str = self.resolve_visibility_for_offline(visibility.clone());
    let provider = self.get_provider(&table, Some(&visibility_str))?;

    for record in raw_records {
      let validated = validate_model(&table, &record, false, visibility.clone())
        .map_err(|e| err_response_formatted("Validation failed in updateAll", &e))?;

      if let Some(id) = validated.get("id").and_then(|v| v.as_str()) {
        if let Ok(Some(existing)) = provider.find_by_id(&table, id).await {
          let mut validated_with_immutable = validated;
          Self::merge_immutable_fields(&existing, &mut validated_with_immutable);
          validated_records.push(validated_with_immutable);
        } else {
          validated_records.push(validated);
        }
      } else {
        validated_records.push(validated);
      }
    }

    for record in &validated_records {
      if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
        if let Err(_e) = provider.update(&table, id, record.clone()).await {}
      }
    }

    let projected_records = self.apply_projection_recursive(validated_records);
    let _elapsed = start.elapsed();

    Ok(success_response(DataValue::Array(projected_records)))
  }

  async fn handle_update(
    &self,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let _start = Instant::now();
    let id_str = id.ok_or_else(|| err_response("Data required for update"))?;

    let data_val = data.ok_or_else(|| err_response("Data required for update"))?;

    let validated_data = validate_model(&table, &data_val, false, visibility.clone())
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let new_visibility = validated_data
      .get("visibility")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());

    let visibility_str = self.resolve_visibility_for_offline(visibility);

    let effective_visibility = new_visibility.as_deref().or(Some(visibility_str.as_str()));

    let provider = self.get_provider(&table, effective_visibility)?;

    let (existing_record, record_provider): (_, DataProvider) =
      match provider.find_by_id(&table, &id_str).await {
        Ok(Some(record)) => (record, provider),
        _ => {
          let mut found_record = None;
          let mut found_provider = None;

          if let Some(ref mongo) = self.mongodb_provider {
            if let Ok(Some(record)) = mongo.find_by_id(&table, &id_str).await {
              found_record = Some(record);
              found_provider = Some(DataProvider::Mongo(mongo.clone()));
            }
          }

          if found_record.is_none() {
            if let Ok(Some(record)) = self.json_provider.find_by_id(&table, &id_str).await {
              found_record = Some(record);
              found_provider = Some(DataProvider::Json(Arc::new(self.json_provider.clone())));
            }
          }

          (
            found_record.ok_or_else(|| err_response("Document not found"))?,
            found_provider.unwrap_or(DataProvider::Json(Arc::new(self.json_provider.clone()))),
          )
        }
      };

    let old_visibility = existing_record.get("visibility").and_then(|v| v.as_str());
    let old_status = existing_record.get("status").and_then(|v| v.as_str());
    let visibility_changed = old_visibility != new_visibility.as_deref();

    let current_provider = record_provider;

    let mut validated_data = validated_data;
    Self::merge_immutable_fields(&existing_record, &mut validated_data);

    let mut merged_data = if let (Some(existing_obj), Some(update_obj)) =
      (existing_record.as_object(), validated_data.as_object())
    {
      let mut merged = existing_obj.clone();
      for (k, v) in update_obj {
        merged.insert(k.clone(), v.clone());
      }
      serde_json::to_value(merged)
        .map_err(|e| err_response_formatted("Merge failed", &e.to_string()))?
    } else {
      validated_data.clone()
    };

    if table == "todos" {
      let is_sharing =
        new_visibility.as_deref() == Some("shared") || new_visibility.as_deref() == Some("public");

      if is_sharing && visibility_changed {
        if let Some(owner_id) = merged_data.get("user_id").and_then(|v| v.as_str()) {
          let assignees = merged_data
            .get("assignees")
            .and_then(|v| v.as_array())
            .map(|arr| arr.to_vec())
            .unwrap_or_default();

          if !assignees.iter().any(|a| a.as_str() == Some(owner_id)) {
            let mut new_assignees = assignees;
            new_assignees.push(serde_json::Value::String(owner_id.to_string()));
            if let Some(obj) = merged_data.as_object_mut() {
              obj.insert(
                "assignees".to_string(),
                serde_json::Value::Array(new_assignees),
              );
            }
          }
        }
      }

      let new_assignees = merged_data
        .get("assignees")
        .and_then(|v| v.as_array())
        .map(|arr| arr.to_vec())
        .unwrap_or_default();

      if !new_assignees.is_empty() {
        let current_roles = merged_data
          .get("assignee_roles")
          .and_then(|v| v.as_object())
          .map(|obj| obj.clone())
          .unwrap_or_default();

        let mut roles_changed = false;
        let mut new_roles = current_roles;

        for assignee in &new_assignees {
          if let Some(assignee_str) = assignee.as_str() {
            if !new_roles.contains_key(assignee_str) {
              new_roles.insert(
                assignee_str.to_string(),
                serde_json::Value::String("viewer".to_string()),
              );
              roles_changed = true;
            }
          }
        }

        if roles_changed {
          if let Some(obj) = merged_data.as_object_mut() {
            obj.insert(
              "assignee_roles".to_string(),
              serde_json::Value::Object(new_roles),
            );
          }
        }
      }
    }

    let updated_record = current_provider
      .update(&table, &id_str, merged_data)
      .await?;

    if table == "todos" && visibility_changed {
      let source_provider = if matches!(current_provider, DataProvider::Json(_)) {
        "Json"
      } else {
        "Mongo"
      };
      let target_provider = if new_visibility.as_deref() == Some("private") {
        "Json"
      } else {
        "Mongo"
      };
      self
        .cascade_service
        .sync_todo_with_children(
          &id_str,
          source_provider,
          target_provider,
          new_visibility.as_deref().unwrap_or("private"),
          false,
        )
        .await?;
    }

    if table == "profiles" {
      if let Some(profile_id) = updated_record.get("id").and_then(|v| v.as_str()) {
        let profile_id_clone = profile_id.to_string();
        let profile_service = self.profile_service.clone();
        let handle = tokio::spawn(async move {
          let _ = profile_service
            .sync_profile_to_cloud(profile_id_clone)
            .await;
        });
        if let Ok(mut handles) = self.spawned_handles.write() {
          handles.push(handle);
        }
      }
    }

    let new_status = updated_record.get("status").and_then(|v| v.as_str());

    let todo_id = if table == "tasks" {
      updated_record
        .get("todo_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    } else if let Some(task_id) = updated_record.get("task_id").and_then(|v| v.as_str()) {
      self.get_todo_id_from_task(task_id).await
    } else {
      None
    };

    if (table == "tasks" || table == "subtasks") && old_status != new_status {
      if let Some(tid) = todo_id {
        if table == "tasks" {
          if new_status == Some("completed") && old_status != Some("completed") {
            let _ = self.count_service.on_task_completed(&tid).await;
          } else if old_status == Some("completed") && new_status != Some("completed") {
            let _ = self.count_service.on_task_uncompleted(&tid).await;
          }
        } else if table == "subtasks" {
          if let Some(task_id) = updated_record.get("task_id").and_then(|v| v.as_str()) {
            if new_status == Some("completed") && old_status != Some("completed") {
              let _ = self.count_service.on_subtask_completed(task_id, &tid).await;
            } else if old_status == Some("completed") && new_status != Some("completed") {
              let _ = self
                .count_service
                .on_subtask_uncompleted(task_id, &tid)
                .await;
            }
          }
        }
      }
    }

    let new_visibility = validated_data.get("visibility").and_then(|v| v.as_str());
    let old_visibility = updated_record.get("visibility").and_then(|v| v.as_str());

    if let (Some(new_vis), Some(old_vis)) = (new_visibility, old_visibility) {
      if new_vis != old_vis {
        let mongodb_available = self.mongodb_provider.is_some();
        let source = Self::determine_source(Some(old_vis), mongodb_available);
        let target = Self::determine_source(Some(new_vis), mongodb_available);

        if target == DataSource::Local {
          self.cascade_service.move_todo_to_json(&id_str).await?;
        } else if source == DataSource::Local && target == DataSource::Cloud {
          self.cascade_service.migrate_todo_to_mongo(&id_str).await?;
        } else if target == DataSource::Both {
          self.cascade_service.move_todo_to_json(&id_str).await?;
          self.cascade_service.migrate_todo_to_mongo(&id_str).await?;
        }
      }
    }

    if table == "todos" && old_visibility != Some("private") && old_status != new_status {
      self.cascade_service.backup_todo_to_json(&id_str).await?;
    }

    if table == "todos" && old_visibility == Some("private") && old_status != new_status {
      self
        .cascade_service
        .sync_entity_to_mongo(&table, &id_str)
        .await?;
    }

    self.cache_service.invalidate_collection(&table).await;

    let _ = self
      .activity_monitor
      .log_action(&table, "update", &updated_record, None)
      .await;

    let projection = security_projection();
    let response_doc = projection.apply_recursive(&updated_record);

    Ok(success_response(DataValue::Object(response_doc)))
  }

  async fn handle_delete(
    &self,
    table: String,
    id: Option<String>,
    visibility: Option<String>,
    is_permanent: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();
    let id_str = id.ok_or_else(|| err_response("ID required for delete"))?;

    let visibility_str = self.resolve_visibility_for_offline(visibility);
    let provider = self.get_provider(&table, Some(&visibility_str))?;

    if table == "tasks" || table == "subtasks" || table == "comments" {
      let provider = self.get_provider(&table, Some(&visibility_str)).ok();
      if let Some(ref p) = provider {
        if let Ok(Some(existing)) = p.find_by_id(&table, &id_str).await {
          if table == "tasks" {
            let was_completed = existing.get("status") == Some(&json!("completed"));
            if let Some(todo_id) = existing.get("todo_id").and_then(|v| v.as_str()) {
              let count_service = self.count_service.clone();
              let todo_id_clone = todo_id.to_string();
              let handle = tokio::spawn(async move {
                let _ = count_service
                  .on_task_deleted(&todo_id_clone, was_completed)
                  .await;
              });
              if let Ok(mut handles) = self.spawned_handles.write() {
                handles.push(handle);
              }
            }
          } else if table == "subtasks" {
            let was_completed = existing.get("status") == Some(&json!("completed"));
            if let Some(task_id) = existing.get("task_id").and_then(|v| v.as_str()) {
              let count_service = self.count_service.clone();
              let task_id_clone = task_id.to_string();
              let todo_id_opt = self.get_todo_id_from_task(&task_id_clone).await;
              if let Some(todo_id) = todo_id_opt {
                let todo_id_clone = todo_id.to_string();
                let handle = tokio::spawn(async move {
                  let _ = count_service
                    .on_subtask_deleted(&task_id_clone, &todo_id_clone, was_completed)
                    .await;
                });
                if let Ok(mut handles) = self.spawned_handles.write() {
                  handles.push(handle);
                }
              }
            }
          } else if table == "comments" {
            let task_id = existing.get("task_id").and_then(|v| v.as_str());
            let subtask_id = existing.get("subtask_id").and_then(|v| v.as_str());
            let count_service = self.count_service.clone();
            let task_id_clone = task_id.map(|s| s.to_string());
            let subtask_id_clone = subtask_id.map(|s| s.to_string());
            let visibility_clone = visibility_str.clone();
            let handle = tokio::spawn(async move {
              let _ = count_service
                .on_comment_deleted(
                  task_id_clone.as_deref(),
                  subtask_id_clone.as_deref(),
                  &visibility_clone,
                )
                .await;
            });
            if let Ok(mut handles) = self.spawned_handles.write() {
              handles.push(handle);
            }
          }
        }
      }
    }

    if is_permanent {
      match &provider {
        DataProvider::Json(_) => {
          let _ = self.json_provider.delete(&table, &id_str).await;
          self
            .cascade_service
            .permanent_delete_cascade_json(&table, &id_str)
            .await?;
        }
        DataProvider::Mongo(_) => {
          if let Some(ref mongo) = self.mongodb_provider {
            let _ = mongo.delete(&table, &id_str).await;
          }
          self
            .cascade_service
            .permanent_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
        DataProvider::Both(_, _mongo) => {
          let _ = self.json_provider.delete(&table, &id_str).await;
          if let Some(ref mongo) = self.mongodb_provider {
            let _ = mongo.delete(&table, &id_str).await;
          }
          self
            .cascade_service
            .permanent_delete_cascade_json(&table, &id_str)
            .await?;
          self
            .cascade_service
            .permanent_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
      }
    } else {
      match &provider {
        DataProvider::Json(_) => {
          self
            .cascade_service
            .soft_delete_cascade_json(&table, &id_str)
            .await?;
        }
        DataProvider::Mongo(_) => {
          self
            .cascade_service
            .soft_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
        DataProvider::Both(_, _mongo) => {
          self
            .cascade_service
            .soft_delete_cascade_json(&table, &id_str)
            .await?;
          self
            .cascade_service
            .soft_delete_cascade_mongo(&table, &id_str)
            .await?;
        }
      }
    }

    self.cache_service.invalidate_collection(&table).await;

    let _ = self
      .activity_monitor
      .log_action(&table, "delete", &json!({"id": id_str.clone()}), None)
      .await;

    let _elapsed = start.elapsed();

    self.emit_db_change_event("deleted", &table, &serde_json::json!({"id": id_str}));

    Ok(success_response(DataValue::String(id_str.clone())))
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
