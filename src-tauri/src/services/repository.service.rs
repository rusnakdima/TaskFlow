// TODO: Consider refactoring to reduce scope
/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;
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
  common::merge_immutable_fields,
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
use crate::services::profile_service::ProfileService;

// ARCHITECTURAL NOTE: RepositoryService is a god service that coordinates multiple providers
// (JSON, MongoDB), cache, cascade operations, and entity resolution. Future refactoring should
// split these into focused services following single responsibility principle.
pub struct RepositoryService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub cascade_service: CascadeService,
  pub count_service: Arc<CountService>,
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
    offline: bool,
  ) -> Result<DataProvider<'_>, ResponseModel> {
    let _vis = visibility.unwrap_or("private");

    // IMMEDIATE return for offline - no MongoDB operations allowed
    if offline {
      return Ok(DataProvider::Json(&self.json_provider));
    }

    let use_json = self.use_json_provider(table, visibility, offline);

    if use_json {
      Ok(DataProvider::Json(&self.json_provider))
    } else {
      match self.mongodb_provider.as_ref() {
        Some(p) => Ok(DataProvider::Mongo(p.as_ref())),
        None => {
          if visibility == Some("all")
            || visibility == Some("shared")
            || visibility == Some("public")
          {
            Ok(DataProvider::Json(&self.json_provider))
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
      entity_resolution,
      activity_monitor,
      profile_service,
      query_cache: None,
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    // NOTE: QueryCache uses LRU-style invalidation. When invalidate_collection is called,
    // entries for that table are evicted. The cache has internal size management.
    self.query_cache = Some(Arc::new(cache));
    self
  }

  fn use_json_provider_for_visibility(visibility: &str) -> bool {
    visibility == "private"
  }

  fn use_json_provider(&self, table: &str, visibility: Option<&str>, offline: bool) -> bool {
    // Offline and daily_activities always use JSON provider
    if offline || table == "daily_activities" {
      return true;
    }
    // Other tables check visibility - only private goes to JSON
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

  #[allow(dead_code)]
  async fn resolve_visibility_from_parent(&self, table: &str, data: &Value) -> Option<String> {
    let parent_id: String = match table {
      "tasks" => data.get("todo_id")?.as_str()?.to_string(),
      "subtasks" => data.get("task_id")?.as_str()?.to_string(),
      "comments" => {
        if let Some(task_id) = data.get("task_id")?.as_str() {
          task_id.to_string()
        } else {
          let subtask_id = data.get("subtask_id")?.as_str()?;
          let task_id_opt = self
            .entity_resolution
            .get_task_id_for_subtask(subtask_id)
            .await
            .ok()?;
          task_id_opt?
        }
      }
      _ => return None,
    };

    let parent_table = match table {
      "tasks" => "todos",
      "subtasks" | "comments" => "tasks",
      _ => return None,
    };

    if let Some(mongo) = self.mongodb_provider.as_ref() {
      if let Ok(Some(doc)) = mongo.find_by_id(parent_table, &parent_id).await {
        if let Some(visibility) = doc.get("visibility").and_then(|v| v.as_str()) {
          return Some(visibility.to_string());
        }
      }
    }

    if let Ok(Some(doc)) = self
      .json_provider
      .find_by_id(parent_table, &parent_id)
      .await
    {
      if let Some(visibility) = doc.get("visibility").and_then(|v| v.as_str()) {
        return Some(visibility.to_string());
      }
    }

    None
  }

  fn build_filter(&self, filter_value: &Value) -> Option<Filter> {
    if filter_value.is_object() && filter_value.as_object().is_none_or(|obj| obj.is_empty()) {
      return None;
    }

    Filter::from_json(filter_value).ok()
  }

  fn parse_load_param(load: Option<String>) -> Vec<String> {
    match load {
      Some(l) => {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(&l) {
          return arr;
        }
        l.split(',').map(|s| s.trim().to_string()).collect()
      }
      None => vec![],
    }
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
          Err(_e) => {
            return Err(err_response_formatted(
              "Relation loading failed",
              "unknown error",
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
    tracing::trace!(
      "add_collection_metadata: collection={}, doc_count={}",
      collection,
      docs.len()
    );
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

  fn merge_immutable_fields(existing: &Value, validated: &mut Value) {
    merge_immutable_fields(existing, validated);
  }

  fn filter_out_deleted(&self, docs: Vec<Value>) -> Vec<Value> {
    crate::helpers::common::filter_deleted(docs)
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
    load: Option<String>,
    visibility: Option<String>,
    offline: bool,
  ) -> Result<ResponseModel, ResponseModel> {
    match operation.as_str() {
      "getAll" => {
        self
          .handle_get_all(table, filter, load, visibility, offline)
          .await
      }
      "get" => {
        self
          .handle_get(table, id, load, visibility, filter, offline)
          .await
      }
      "create" => self.handle_create(table, data, visibility, offline).await,
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
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();
    let request_id = "unknown".to_string();

    let filter_val = filter.unwrap_or(json!({}));
    let filter_opt = self.build_filter(&filter_val);

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);

    let use_json = self.use_json_provider(&table, Some(&visibility_str), offline);

    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

    let load_paths = Self::parse_load_param(load);

    let (docs, used_json_fallback) = match provider.find_many(&table, filter_opt.as_ref()).await {
      Ok(docs) => (docs, false),
      Err(_e) => {
        let json_provider = DataProvider::Json(&self.json_provider);
        let docs = json_provider.find_many(&table, filter_opt.as_ref()).await?;
        (docs, true)
      }
    };

    let docs = if !load_paths.is_empty() {
      if matches!(provider, DataProvider::Mongo(_)) && !used_json_fallback {
        if let Some(ref mongo) = self.mongodb_provider {
          self
            .load_relations_for_get_all(docs, &table, &load_paths, mongo.as_ref().clone())
            .await?
        } else {
          self
            .load_relations_for_get_all(docs, &table, &load_paths, self.json_provider.clone())
            .await?
        }
      } else {
        self
          .load_relations_for_get_all(docs, &table, &load_paths, self.json_provider.clone())
          .await?
      }
    } else {
      docs
    };

    let docs = if used_json_fallback || use_json {
      docs
    } else {
      self.filter_out_deleted(docs)
    };

    let elapsed = start.elapsed();

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
    tracing::debug!(
      "load_relations_for_get_all: table={}, load_paths={:?}, doc_count={}",
      table,
      load_paths,
      current_docs.len()
    );
    for path in load_paths {
      let segments: Vec<&str> = path.split('.').collect();
      if segments.is_empty() {
        continue;
      }

      for doc in &mut current_docs {
        if let Some(obj) = doc.as_object_mut() {
          obj.insert("_collection".to_string(), Value::String(table.to_string()));
        }
      }

      let loader = RelationLoader::new(provider.clone());
      match loader
        .load_nested(current_docs, &segments, table, true)
        .await
      {
        Ok(loaded) => {
          current_docs = loaded;
        }
        Err(_e) => {
          return Err(err_response_formatted(
            "Relation loading failed",
            &_e.to_string(),
          ));
        }
      }
    }

    Ok(current_docs)
  }

  async fn handle_get(
    &self,
    table: String,
    id: Option<String>,
    load: Option<String>,
    visibility: Option<String>,
    filter: Option<Value>,
    offline: bool,
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
            provider.find_many(&table, Some(&filter_obj)).await?
          } else {
            return Err(err_response("Document not found"));
          }
        }
      }
    } else if let Some(f) = &filter {
      let filter_obj = nosql_orm::query::Filter::from_json(f)
        .map_err(|e| err_response(&format!("Invalid filter: {}", e)))?;
      provider.find_many(&table, Some(&filter_obj)).await?
    } else {
      return Err(err_response("ID or filter is required for get operation"));
    };

    let load_paths = Self::parse_load_param(load);

    let docs = if !load_paths.is_empty() {
      self
        .load_relations_via_nosql_orm(
          docs,
          &table,
          &load_paths,
          matches!(provider, DataProvider::Mongo(_)),
        )
        .await?
    } else {
      docs
    };

    let projected = self.apply_projection_recursive(docs);
    let elapsed = start.elapsed();

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
  ) -> Result<ResponseModel, ResponseModel> {
    let start = Instant::now();

    let mut data_val = data.ok_or_else(|| err_response("Data required for create"))?;

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);

    if table == "todos" {
      if let serde_json::Value::Object(ref mut obj) = data_val {
        obj.insert(
          "visibility".to_string(),
          serde_json::Value::String(visibility_str.clone()),
        );
      }
    }

    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

    let validated_data = validate_model(&table, &data_val, true, Some(visibility_str.clone()))
      .map_err(|e| err_response_formatted("Validation failed", &e))?;

    let created_record = provider.insert(&table, validated_data).await?;

    self.invalidate_cache(&table).await;

    if table == "tasks" {
      if let Some(todo_id) = created_record.get("todo_id").and_then(|v| v.as_str()) {
        let count_service = self.count_service.clone();
        let todo_id_clone = todo_id.to_string();
        tokio::spawn(async move {
          let _ = count_service.on_task_created(&todo_id_clone, offline).await;
        });
      }
    } else if table == "subtasks" {
      if let Some(task_id) = created_record.get("task_id").and_then(|v| v.as_str()) {
        let count_service = self.count_service.clone();
        let task_id_clone = task_id.to_string();
        let todo_id_opt = self.get_todo_id_from_task(&task_id_clone).await;
        if let Some(todo_id) = todo_id_opt {
          let todo_id_clone = todo_id.to_string();
          tokio::spawn(async move {
            let _ = count_service
              .on_subtask_created(&task_id_clone, &todo_id_clone, offline)
              .await;
          });
        }
      }
    } else if table == "chats" {
      if let Some(todo_id) = created_record.get("todo_id").and_then(|v| v.as_str()) {
        let count_service = self.count_service.clone();
        let todo_id_clone = todo_id.to_string();
        tokio::spawn(async move {
          let _ = count_service.on_chat_created(&todo_id_clone, offline).await;
        });
      }
    } else if table == "comments" {
      let task_id = created_record.get("task_id").and_then(|v| v.as_str());
      let subtask_id = created_record.get("subtask_id").and_then(|v| v.as_str());
      let count_service = self.count_service.clone();
      let task_id_clone = task_id.map(|s| s.to_string());
      let subtask_id_clone = subtask_id.map(|s| s.to_string());
      tokio::spawn(async move {
        let _ = count_service
          .on_comment_created(
            task_id_clone.as_deref(),
            subtask_id_clone.as_deref(),
            offline,
          )
          .await;
      });
    }

    if offline {
      let monitor = self.activity_monitor.clone();
      let table_clone = table.to_string();
      let record_clone = created_record.clone();
      tokio::spawn(async move {
        let _ = monitor
          .log_action(&table_clone, "create", &record_clone, None)
          .await;
      });
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
    let elapsed = start.elapsed();
    let created_id = final_record
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
    provider.find_many("subtasks", Some(&filter)).await
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
    let elapsed = start.elapsed();

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

    let visibility_str = self.resolve_visibility_for_offline(visibility, offline);
    let provider = self.get_provider(&table, Some(&visibility_str), offline)?;

    let existing_record = provider
      .find_by_id(&table, &id_str)
      .await?
      .ok_or_else(|| err_response("Document not found"))?;

    let old_status = existing_record.get("status").and_then(|v| v.as_str());

    let mut validated_data = validated_data;
    Self::merge_immutable_fields(&existing_record, &mut validated_data);

    let merged_data = if let (Some(existing_obj), Some(update_obj)) =
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

    if offline {
      let monitor = self.activity_monitor.clone();
      let table_clone = table.to_string();
      let record_clone = updated_record.clone();
      tokio::spawn(async move {
        let _ = monitor
          .log_action(&table_clone, "update", &record_clone, None)
          .await;
      });
    } else {
      let _ = self
        .activity_monitor
        .log_action(&table, "update", &updated_record, None)
        .await;
    }

    let projection = security_projection();
    let response_doc = projection.apply_recursive(&updated_record);
    let elapsed = start.elapsed();

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

    if table == "tasks" || table == "subtasks" || table == "chats" || table == "comments" {
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
              tokio::spawn(async move {
                let _ = count_service
                  .on_task_deleted(&todo_id_clone, was_completed, offline)
                  .await;
              });
            }
          } else if table == "subtasks" {
            let was_completed = existing.get("status") == Some(&json!("completed"));
            if let Some(task_id) = existing.get("task_id").and_then(|v| v.as_str()) {
              let count_service = self.count_service.clone();
              let task_id_clone = task_id.to_string();
              let todo_id_opt = self.get_todo_id_from_task(&task_id_clone).await;
              if let Some(todo_id) = todo_id_opt {
                let todo_id_clone = todo_id.to_string();
                tokio::spawn(async move {
                  let _ = count_service
                    .on_subtask_deleted(&task_id_clone, &todo_id_clone, was_completed, offline)
                    .await;
                });
              }
            }
          } else if table == "chats" {
            if let Some(todo_id) = existing.get("todo_id").and_then(|v| v.as_str()) {
              let count_service = self.count_service.clone();
              let todo_id_clone = todo_id.to_string();
              tokio::spawn(async move {
                let _ = count_service.on_chat_deleted(&todo_id_clone, offline).await;
              });
            }
          } else if table == "comments" {
            let task_id = existing.get("task_id").and_then(|v| v.as_str());
            let subtask_id = existing.get("subtask_id").and_then(|v| v.as_str());
            let count_service = self.count_service.clone();
            let task_id_clone = task_id.map(|s| s.to_string());
            let subtask_id_clone = subtask_id.map(|s| s.to_string());
            tokio::spawn(async move {
              let _ = count_service
                .on_comment_deleted(
                  task_id_clone.as_deref(),
                  subtask_id_clone.as_deref(),
                  offline,
                )
                .await;
            });
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

    self.invalidate_cache(&table).await;

    if offline {
      let monitor = self.activity_monitor.clone();
      let table_clone = table.to_string();
      let id_clone = id_str.clone();
      tokio::spawn(async move {
        let _ = monitor
          .log_action(&table_clone, "delete", &json!({"id": id_clone}), None)
          .await;
      });
    } else {
      let _ = self
        .activity_monitor
        .log_action(&table, "delete", &json!({"id": id_str.clone()}), None)
        .await;
    }

    let elapsed = start.elapsed();

    Ok(success_response(DataValue::String(id_str)))
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
