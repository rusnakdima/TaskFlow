use std::sync::Arc;

use nosql_orm::cache::QueryCache;
use nosql_orm::query::Filter;
use serde_json::{json, Value};

use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, err_response_formatted, success_response};
use crate::providers::json_provider::JsonProvider;
use crate::services::entity_resolution_service::EntityResolutionService;

pub struct JsonRepoService {
  pub json_provider: JsonProvider,
  pub entity_resolution: Arc<EntityResolutionService>,
  pub query_cache: Option<Arc<QueryCache>>,
}

impl JsonRepoService {
  pub fn new(
    json_provider: JsonProvider,
    entity_resolution: Arc<EntityResolutionService>,
  ) -> Self {
    Self {
      json_provider,
      entity_resolution,
      query_cache: None,
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    self.query_cache = Some(Arc::new(cache));
    self
  }

  pub fn use_json_provider_for_visibility(visibility: &str) -> bool {
    visibility == "private"
  }

  pub fn use_json_provider(&self, table: &str, visibility: Option<&str>) -> bool {
    if table == "daily_activities" {
      return true;
    }
    let vis = visibility.unwrap_or("private");
    vis == "private"
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

  async fn invalidate_cache(&self, table: &str) {
    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(table).await;
    }
  }

  fn filter_out_deleted(&self, mut docs: Vec<Value>) -> Vec<Value> {
    docs.retain(|doc| doc.get("deleted_at").map(|v| v.is_null()).unwrap_or(true));
    docs
  }

  pub async fn find_many(
    &self,
    table: &str,
    filter: Option<Value>,
    load: Option<String>,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter_val = filter.unwrap_or(json!({}));
    let filter_opt = self.build_filter(&filter_val);
    let load_paths = Self::parse_load_param(load);

    let docs = self
      .json_provider
      .find_many(table, filter_opt.as_ref(), None, None, None, false)
      .await
      .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?;

    let docs = self.filter_out_deleted(docs);
    let projected = self.apply_projection(docs);

    if load_paths.is_empty() {
      return Ok(success_response(DataValue::Array(projected)));
    }

    self
      .load_relations(docs, table, &load_paths)
      .await
      .map(|docs| success_response(DataValue::Array(docs)))
  }

  pub async fn find_by_id(
    &self,
    table: &str,
    id: &str,
    load: Option<String>,
    _visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .json_provider
      .find_by_id(table, id)
      .await
      .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?
      .ok_or_else(|| err_response("Document not found"))?;

    if !doc.get("deleted_at").map(|v| v.is_null()).unwrap_or(true) {
      return Err(err_response("Document not found"));
    }

    let load_paths = Self::parse_load_param(load);
    let mut docs = vec![doc];

    if !load_paths.is_empty() {
      docs = self.load_relations(docs, table, &load_paths).await?;
    }

    let projected = self.apply_projection(docs);
    Ok(success_response(DataValue::Object(
      projected
        .into_iter()
        .next()
        .ok_or_else(|| err_response("Document not found"))?,
    )))
  }

  pub async fn insert(
    &self,
    table: &str,
    data: Value,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let visibility_str = visibility
      .or_else(|| self.get_visibility_from_data(table, &data))
      .or_else(|| {
        tauri::async_runtime::block_on(self.resolve_visibility_from_parent(table, &data))
      })
      .unwrap_or_else(|| "private".to_string());

    if !Self::use_json_provider_for_visibility(&visibility_str) {
      return Err(err_response(
        "Cannot create shared/team records in JSON provider. Use MongoDB.",
      ));
    }

    let created = self.json_provider.insert(table, data).await?;

    self.invalidate_cache(table).await;

    let projection = self.security_projection();
    let response_doc = projection.apply_recursive(&created);
    Ok(success_response(DataValue::Object(response_doc)))
  }

  pub async fn update(
    &self,
    table: &str,
    id: &str,
    data: Value,
    _visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let updated = self.json_provider.update(table, id, data).await?;

    self.invalidate_cache(table).await;

    let projection = self.security_projection();
    let response_doc = projection.apply_recursive(&updated);
    Ok(success_response(DataValue::Object(response_doc)))
  }

  pub async fn delete(&self, table: &str, id: &str) -> Result<ResponseModel, ResponseModel> {
    self
      .json_provider
      .delete(table, id)
      .await
      .map_err(|e| err_response_formatted("Delete failed", &e.to_string()))?;

    self.invalidate_cache(table).await;
    Ok(success_response(DataValue::String(id.to_string())))
  }

  pub async fn soft_delete(&self, table: &str, id: &str) -> Result<ResponseModel, ResponseModel> {
    let doc = self
      .json_provider
      .find_by_id(table, id)
      .await
      .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?
      .ok_or_else(|| err_response("Document not found"))?;

    let mut updated_doc = doc;
    if let Some(obj) = updated_doc.as_object_mut() {
      obj.insert(
        "deleted_at".to_string(),
        serde_json::json!(chrono::Utc::now().to_rfc3339()),
      );
    }

    let result = self.json_provider.update(table, id, updated_doc).await?;
    self.invalidate_cache(table).await;
    Ok(success_response(DataValue::Object(result)))
  }

  fn get_visibility_from_data(&self, _table: &str, data: &Value) -> Option<String> {
    data
      .get("visibility")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string())
  }

  async fn resolve_visibility_from_parent(
    &self,
    table: &str,
    data: &Value,
  ) -> Option<String> {
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

  async fn load_relations(
    &self,
    docs: Vec<Value>,
    table: &str,
    load_paths: &[String],
  ) -> Result<Vec<Value>, ResponseModel> {
    if load_paths.is_empty() || docs.is_empty() {
      return Ok(docs);
    }

    use nosql_orm::relations::RelationLoader;

    let loader = RelationLoader::new(self.json_provider.clone());
    let mut result_docs = docs;

    for path in load_paths {
      let segments: Vec<&str> = path.split('.').collect();
      if segments.is_empty() {
        continue;
      }

      for doc in &mut result_docs {
        if let Some(obj) = doc.as_object_mut() {
          if !obj.contains_key("_collection") {
            obj.insert("_collection".to_string(), Value::String(table.to_string()));
          }
        }
      }

      match loader
        .load_nested(result_docs, &segments, table, true)
        .await
      {
        Ok(loaded) => result_docs = loaded,
        Err(e) => {
          return Err(err_response_formatted("Relation loading failed", &e.to_string()));
        }
      }
    }

    Ok(result_docs)
  }

  fn apply_projection(&self, docs: Vec<Value>) -> Vec<Value> {
    use crate::helpers::security_helper::security_projection;
    let projection = security_projection();
    docs
      .into_iter()
      .map(|doc| projection.apply_recursive(&doc))
      .collect()
  }

  fn security_projection(&self) -> crate::helpers::security_helper::SecurityProjection {
    use crate::helpers::security_helper::security_projection;
    security_projection()
  }
}