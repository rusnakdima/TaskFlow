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

/* helpers */
use crate::helpers::{
  collection_metadata::add_collection_metadata,
  load_param::parse_load_param,
  relation_stripper::strip_relation_fields,
  response_helper::{err_response, err_response_formatted, success_response},
  security_helper::security_projection,
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

pub struct RepositoryService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub cascade_service: CascadeService,
  pub count_service: Arc<CountService>,
  pub cache_service: CacheService,
  pub activity_monitor: ActivityMonitorService,
  pub profile_service: ProfileService,
  pub entity_resolution: Arc<EntityResolutionService>,
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
  fn get_provider(
    &self,
    table: &str,
    visibility: Option<&str>,
    offline: bool,
  ) -> Result<DataProvider, ResponseModel> {
    let _vis = visibility.unwrap_or("private");

    let is_shared_or_public = visibility
      .map(|v| v == "shared" || v == "public")
      .unwrap_or(false);

    if offline && !is_shared_or_public {
      return Ok(DataProvider::Json(Arc::new(self.json_provider.clone())));
    }

    let use_json = self.use_json_provider(table, visibility, offline);

    if use_json {
      Ok(DataProvider::Json(Arc::new(self.json_provider.clone())))
    } else {
      match self.mongodb_provider.as_ref() {
        Some(p) => Ok(DataProvider::Mongo(p.clone())),
        None => {
          if visibility == Some("all")
            || visibility == Some("shared")
            || visibility == Some("public")
          {
            Ok(DataProvider::Json(Arc::new(self.json_provider.clone())))
          } else {
            Err(err_response(
              "MongoDB not available - cannot create shared/team records. Please connect to the internet or change todo visibility to private.",
            ))
          }
        }
      }
    }
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
      spawned_handles: RwLock::new(Vec::new()),
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    let new_cache_service = CacheService::new().with_cache(cache);
    self.cache_service = new_cache_service;
    self
  }

  fn use_json_provider_for_visibility(visibility: &str) -> bool {
    visibility == "private"
  }

  fn use_json_provider(&self, table: &str, visibility: Option<&str>, offline: bool) -> bool {
    if offline || table == "daily_activities" {
      return true;
    }
    visibility.unwrap_or("private") == "private"
  }

  fn resolve_visibility_for_offline(&self, visibility: Option<String>, offline: bool) -> String {
    if let Some(vis) = visibility {
      return vis;
    }

    if offline {
      return "private".to_string();
    }

    "private".to_string()
  }

  async fn get_todo_id_from_task(&self, task_id: &str) -> Option<String> {
    let provider = self.get_provider("tasks", None, true).ok()?;
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

    let docs_with_meta = add_collection_metadata(docs, table);

    let loader = RelationLoader::new(provider);

    match loader
      .load_relations_on_docs(docs_with_meta, table, &segments, true)
      .await
    {
      Ok(loaded) => Ok(loaded),
      Err(e) => Err(err_response_formatted(
        "Relation loading failed",
        &e.to_string(),
      )),
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
      *validated = serde_json::to_value(merged).unwrap_or_else(|_| validated.clone());
    }
  }

  fn filter_out_deleted(&self, docs: Vec<Value>) -> Vec<Value> {
    crate::helpers::common::filter_deleted(docs)
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
    offline: bool,
    user_id: Option<String>,
    skip: Option<u64>,
    limit: Option<u64>,
  ) -> Result<ResponseModel, ResponseModel> {
    match operation.as_str() {
      "getAll" => {
        self
          .handle_get_all(
            table, filter, load, visibility, offline, user_id, skip, limit,
          )
          .await
      }
      "get" => {
        self
          .handle_get(table, id, load, visibility, filter, offline, user_id)
          .await
      }
      "create" => {
        self
          .handle_create(table, data, visibility, offline, user_id)
          .await
      }
      "update" => {
        self
          .handle_update(table, id, data, visibility, offline)
          .await
      }
      "updateAll" => {
        self
          .handle_update_all(table, data, visibility, offline)
          .await
      }
      "delete" => {
        self
          .handle_delete(table, id, visibility, false, offline)
          .await
      }
      "permanent-delete" => {
        self
          .handle_permanent_delete_cascade(table, id, visibility, offline)
          .await
      }
      "soft-delete-cascade" => {
        self
          .handle_soft_delete_cascade(table, id, visibility, offline)
          .await
      }
      "sync-to-provider" => {
        let target = if self.use_json_provider(&table, visibility.as_deref(), offline) {
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
    load: Option<String>,
    visibility: Option<String>,
    offline: bool,
    user_id: Option<String>,
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

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);

    let use_json = self.use_json_provider(&table, Some(&visibility_str), offline);

    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

    let load_paths = parse_load_param(load);

    let final_filter = if table == "todos" {
      let permission_filter_json = PermissionService::get_todo_filter_for_user(
        user_id.as_deref().unwrap_or(""),
        Some(&visibility_str),
      );
      let permission_filter = Filter::from_json(&permission_filter_json).ok();
      match (permission_filter, filter_opt) {
        (Some(perm), Some(existing)) => Some(Filter::And(vec![perm, existing])),
        (Some(perm), None) => Some(perm),
        (None, existing) => existing,
      }
    } else {
      filter_opt
    };

    let (docs, used_json_fallback) = match provider
      .find_many(&table, final_filter.as_ref(), skip, limit, None, true)
      .await
    {
      Ok(docs) => (docs, false),
      Err(_e) => {
        let json_provider = DataProvider::Json(Arc::new(self.json_provider.clone()));
        let docs = json_provider
          .find_many(&table, final_filter.as_ref(), skip, limit, None, true)
          .await?;
        (docs, true)
      }
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
      }
    } else {
      strip_relation_fields(docs, &table)
    };

    let docs = if table == "todos" {
      self.fix_todo_counts_if_needed(docs, &provider).await?
    } else {
      docs
    };

    let docs = if used_json_fallback || use_json {
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
    offline: bool,
    user_id: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);
    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

    let docs: Vec<Value> = if let Some(ref id_val) = id {
      match provider.find_by_id(&table, id_val).await? {
        Some(d) => vec![d],
        None => {
          if let Some(f) = &filter {
            let filter_obj = nosql_orm::query::Filter::from_json(f)
              .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
            provider
              .find_many(&table, Some(&filter_obj), None, None, None, true)
              .await?
          } else {
            return Err(err_response("Document not found"));
          }
        }
      }
    } else if let Some(f) = &filter {
      let filter_obj = nosql_orm::query::Filter::from_json(f)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
      provider
        .find_many(&table, Some(&filter_obj), None, None, None, true)
        .await?
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
    offline: bool,
    user_id: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let mut data_val = data.ok_or_else(|| err_response("Data required for create"))?;

    let visibility_str = if visibility.is_some() {
      self.resolve_visibility_for_offline(visibility, offline)
    } else if let Some(serde_json::Value::String(vis_from_data)) = data_val.get("visibility") {
      vis_from_data.clone()
    } else {
      self.resolve_visibility_for_offline(visibility, offline)
    };

    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

    if table == "todos" {
      if let serde_json::Value::Object(ref mut obj) = data_val {
        obj.insert(
          "visibility".to_string(),
          serde_json::Value::String(visibility_str.clone()),
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

    if table == "tasks" {
      if let Some(todo_id) = created_record.get("todo_id").and_then(|v| v.as_str()) {
        let count_service = self.count_service.clone();
        let todo_id_clone = todo_id.to_string();
        let handle = tokio::spawn(async move {
          let _ = count_service.on_task_created(&todo_id_clone, offline).await;
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
              .on_subtask_created(&task_id_clone, &todo_id_clone, offline)
              .await;
          });
          if let Ok(mut handles) = self.spawned_handles.write() {
            handles.push(handle);
          }
        }
      }
    } else if table == "comments" {
      let task_id = created_record.get("task_id").and_then(|v| v.as_str());
      let subtask_id = created_record.get("subtask_id").and_then(|v| v.as_str());
      let count_service = self.count_service.clone();
      let task_id_clone = task_id.map(|s| s.to_string());
      let subtask_id_clone = subtask_id.map(|s| s.to_string());
      let handle = tokio::spawn(async move {
        let _ = count_service
          .on_comment_created(
            task_id_clone.as_deref(),
            subtask_id_clone.as_deref(),
            offline,
          )
          .await;
      });
      if let Ok(mut handles) = self.spawned_handles.write() {
        handles.push(handle);
      }
    }

    if offline {
      let monitor = self.activity_monitor.clone();
      let table_clone = table.to_string();
      let record_clone = created_record.clone();
      let handle = tokio::spawn(async move {
        let _ = monitor
          .log_action(&table_clone, "create", &record_clone, None)
          .await;
      });
      if let Ok(mut handles) = self.spawned_handles.write() {
        handles.push(handle);
      }
    } else {
      let _ = self
        .activity_monitor
        .log_action(&table, "create", &created_record, None)
        .await;
    }

    let should_publish_to_github = table == "tasks"
      && created_record
        .get("publish_to_github")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut final_record = created_record.clone();

    if should_publish_to_github && !offline {
      if let Ok(updated) = self
        .handle_github_publish_for_task(created_record.clone(), visibility_str.clone())
        .await
      {
        final_record = updated;
      }
    }

    if table == "comments" && !offline {
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

    let provider = self.get_provider("tasks", Some(&visibility), false)?;
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

    let provider = self.get_provider("todos", Some(&visibility), false)?;
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
    let provider = self.get_provider("subtasks", Some(visibility), false)?;
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
    offline: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let data_val = data.ok_or_else(|| err_response("Data required for updateAll"))?;

    let raw_records = data_val
      .as_array()
      .ok_or_else(|| err_response("Data must be an array for updateAll"))?
      .clone();

    let mut validated_records: Vec<Value> = Vec::with_capacity(raw_records.len());
    let visibility_str = self.resolve_visibility_for_offline(visibility.clone(), offline);
    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

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
    offline: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();
    let id_str = id.ok_or_else(|| err_response("Data required for update"))?;

    let data_val = data.ok_or_else(|| err_response("Data required for update"))?;

    let validated_data = validate_model(&table, &data_val, false, visibility.clone())
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let new_visibility = validated_data
      .get("visibility")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);

    let effective_visibility = new_visibility.as_deref().or(Some(visibility_str.as_str()));

    let provider = self.get_provider(&table, effective_visibility, offline)?;

    let mut existing_record = provider.find_by_id(&table, &id_str).await.ok().flatten();

    if existing_record.is_none() && new_visibility.is_some() {
      let fallback_provider = self.get_provider(&table, Some("shared"), false)?;
      existing_record = fallback_provider
        .find_by_id(&table, &id_str)
        .await
        .ok()
        .flatten();
    }

    let existing_record = existing_record.ok_or_else(|| err_response("Document not found"))?;

    let old_visibility = existing_record.get("visibility").and_then(|v| v.as_str());
    let old_status = existing_record.get("status").and_then(|v| v.as_str());

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
      let visibility_changed = old_visibility != new_visibility.as_deref();

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

    let updated_record = provider.update(&table, &id_str, merged_data).await?;

    let new_status = updated_record.get("status").and_then(|v| v.as_str());

    if (table == "tasks" || table == "subtasks") && old_status != new_status {
      let todo_id = if table == "tasks" {
        updated_record
          .get("todo_id")
          .and_then(|v| v.as_str())
          .map(|s| s.to_string())
      } else {
        updated_record
          .get("task_id")
          .and_then(|v| v.as_str())
          .and_then(|task_id| tauri::async_runtime::block_on(self.get_todo_id_from_task(task_id)))
      };

      if let Some(tid) = todo_id {
        if table == "tasks" {
          if new_status == Some("completed") && old_status != Some("completed") {
            let _ = self.count_service.on_task_completed(&tid, offline).await;
          } else if old_status == Some("completed") && new_status != Some("completed") {
            let _ = self.count_service.on_task_uncompleted(&tid, offline).await;
          }
        } else if table == "subtasks" {
          if let Some(task_id) = updated_record.get("task_id").and_then(|v| v.as_str()) {
            if new_status == Some("completed") && old_status != Some("completed") {
              let _ = self
                .count_service
                .on_subtask_completed(task_id, &tid, offline)
                .await;
            } else if old_status == Some("completed") && new_status != Some("completed") {
              let _ = self
                .count_service
                .on_subtask_uncompleted(task_id, &tid, offline)
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
        if Self::use_json_provider_for_visibility(new_vis) {
          self.cascade_service.move_todo_to_json(&id_str).await?;
        } else {
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

    if offline {
      let monitor = self.activity_monitor.clone();
      let table_clone = table.to_string();
      let record_clone = updated_record.clone();
      let handle = tokio::spawn(async move {
        let _ = monitor
          .log_action(&table_clone, "update", &record_clone, None)
          .await;
      });
      if let Ok(mut handles) = self.spawned_handles.write() {
        handles.push(handle);
      }
    } else {
      let _ = self
        .activity_monitor
        .log_action(&table, "update", &updated_record, None)
        .await;
    }

    let projection = security_projection();
    let response_doc = projection.apply_recursive(&updated_record);
    let _elapsed = start.elapsed();

    Ok(success_response(DataValue::Object(response_doc)))
  }

  async fn handle_delete(
    &self,
    table: String,
    id: Option<String>,
    visibility: Option<String>,
    is_permanent: bool,
    offline: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();
    let id_str = id.ok_or_else(|| err_response("ID required for delete"))?;

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);
    let use_json = self.use_json_provider(&table, Some(&visibility_str), offline);

    if table == "tasks" || table == "subtasks" || table == "comments" {
      let provider = self
        .get_provider(&table, Some(&visibility_str), offline)
        .ok();
      if let Some(ref p) = provider {
        if let Ok(Some(existing)) = p.find_by_id(&table, &id_str).await {
          if table == "tasks" {
            let was_completed = existing.get("status") == Some(&json!("completed"));
            if let Some(todo_id) = existing.get("todo_id").and_then(|v| v.as_str()) {
              let count_service = self.count_service.clone();
              let todo_id_clone = todo_id.to_string();
              let handle = tokio::spawn(async move {
                let _ = count_service
                  .on_task_deleted(&todo_id_clone, was_completed, offline)
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
                    .on_subtask_deleted(&task_id_clone, &todo_id_clone, was_completed, offline)
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
            let handle = tokio::spawn(async move {
              let _ = count_service
                .on_comment_deleted(
                  task_id_clone.as_deref(),
                  subtask_id_clone.as_deref(),
                  offline,
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
    } else if use_json {
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

    self.cache_service.invalidate_collection(&table).await;

    if offline {
      let monitor = self.activity_monitor.clone();
      let table_clone = table.to_string();
      let id_clone = id_str.clone();
      let handle = tokio::spawn(async move {
        let _ = monitor
          .log_action(&table_clone, "delete", &json!({"id": id_clone}), None)
          .await;
      });
      if let Ok(mut handles) = self.spawned_handles.write() {
        handles.push(handle);
      }
    } else {
      let _ = self
        .activity_monitor
        .log_action(&table, "delete", &json!({"id": id_str.clone()}), None)
        .await;
    }

    let _elapsed = start.elapsed();

    Ok(success_response(DataValue::String(id_str.clone())))
  }

  async fn handle_soft_delete_cascade(
    &self,
    table: String,
    id: Option<String>,
    visibility: Option<String>,
    offline: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .handle_delete(table, id, visibility, false, offline)
      .await
  }

  async fn handle_permanent_delete_cascade(
    &self,
    table: String,
    id: Option<String>,
    visibility: Option<String>,
    offline: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .handle_delete(table, id, visibility, true, offline)
      .await
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
