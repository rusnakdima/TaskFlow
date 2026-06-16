use serde_json::{json, Value};

use nosql_orm::query::Filter;

use crate::entities::response_entity::ResponseModel;
use crate::helpers::{response_helper::err_response, security::security_projection};
use crate::providers::data_provider::DataProvider;
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;
use crate::services::permission_service::PermissionService;

#[derive(PartialEq)]
pub enum DataSource {
  Local,
  Cloud,
  Both,
}

impl DataSource {
  pub fn determine_source(visibility: Option<&str>, mongodb_available: bool) -> DataSource {
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
}

pub fn get_provider_for_table(
  json_provider: &JsonProvider,
  mongodb_provider: &Option<std::sync::Arc<MongoProvider>>,
  table: &str,
  visibility: Option<&str>,
) -> Result<DataProvider, ResponseModel> {
  use std::sync::Arc;

  if table == "daily_activities" {
    return Ok(DataProvider::Json(Arc::new(json_provider.clone())));
  }

  let mongodb_available = mongodb_provider.is_some();

  match DataSource::determine_source(visibility, mongodb_available) {
    DataSource::Local => Ok(DataProvider::Json(Arc::new(json_provider.clone()))),
    DataSource::Cloud => mongodb_provider
      .as_ref()
      .ok_or_else(|| {
        err_response(
          "MongoDB not available - cannot create shared/team records. Please connect to the internet or change todo visibility to private.",
        )
      })
      .map(|p| DataProvider::Mongo(p.clone())),
    DataSource::Both => match mongodb_provider.as_ref() {
      Some(p) => Ok(DataProvider::Both(Arc::new(json_provider.clone()), p.clone())),
      None => Ok(DataProvider::Json(Arc::new(json_provider.clone()))),
    },
  }
}

pub fn merge_documents(local: Vec<Value>, cloud: Vec<Value>) -> Vec<Value> {
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

pub fn apply_projection_recursive(docs: Vec<Value>) -> Vec<Value> {
  let projection = security_projection();
  docs
    .into_iter()
    .map(|doc| projection.apply_recursive(&doc))
    .collect()
}

pub fn merge_immutable_fields(existing: &Value, validated: &mut Value) {
  if let (Some(existing_obj), Some(validated_obj)) = (existing.as_object(), validated.as_object()) {
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

pub fn filter_out_deleted(docs: Vec<Value>) -> Vec<Value> {
  crate::helpers::common::filter_deleted(docs)
}

pub fn extract_user_id_from_filter(filter: &Filter) -> Option<String> {
  match filter {
    Filter::And(filters) => {
      for f in filters {
        if let Some(uid) = extract_user_id_from_filter(f) {
          return Some(uid);
        }
      }
      None
    }
    Filter::Eq(key, value) if key == "user_id" => value.as_str().map(|s| s.to_string()),
    _ => None,
  }
}

pub fn extract_task_id_from_filter(filter: &Filter) -> Option<String> {
  match filter {
    Filter::And(filters) => {
      for f in filters {
        if let Some(tid) = extract_task_id_from_filter(f) {
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

pub fn filter_contains_field(filter: &Filter, field: &str) -> bool {
  match filter {
    Filter::And(filters) | Filter::Or(filters) => {
      filters.iter().any(|f| filter_contains_field(f, field))
    }
    Filter::Eq(key, _)
    | Filter::In(key, _)
    | Filter::Gte(key, _)
    | Filter::Lte(key, _)
    | Filter::Gt(key, _)
    | Filter::Lt(key, _)
    | Filter::Contains(key, _) => key == field,
    Filter::Not(f) => filter_contains_field(f, field),
    _ => false,
  }
}

pub fn resolve_visibility_for_offline(visibility: Option<String>) -> String {
  visibility.unwrap_or_else(|| "private".to_string())
}

pub fn build_todos_filter(
  visibility_str: &str,
  user_id: Option<&str>,
  profile_id: Option<&str>,
) -> Option<Filter> {
  let permission_filter_json = PermissionService::get_todo_filter_for_user(
    user_id.unwrap_or(""),
    profile_id,
    Some(visibility_str),
  );
  Filter::from_json(&permission_filter_json).ok()
}

pub fn build_categories_filter(visibility_str: &str, user_id: Option<&str>) -> Option<Filter> {
  let category_filter_json = match visibility_str {
    "local" | "private" => {
      json!({ "visibility": "private", "user_id": user_id.unwrap_or("") })
    }
    "cloud" | "shared" => {
      json!({
        "$or": [
          { "visibility": "shared", "user_id": user_id.unwrap_or("") },
          { "visibility": "public" }
        ]
      })
    }
    "all" => {
      json!({
        "$or": [
          { "visibility": "private", "user_id": user_id.unwrap_or("") },
          { "visibility": "shared", "user_id": user_id.unwrap_or("") },
          { "visibility": "public" }
        ]
      })
    }
    _ => json!({ "visibility": "private", "user_id": user_id.unwrap_or("") }),
  };
  Filter::from_json(&category_filter_json).ok()
}

pub fn build_chats_filter(user_id: Option<&str>) -> Option<Filter> {
  let uid = user_id.unwrap_or("");
  let sender_filter = Filter::Eq("sender_id".to_string(), Value::String(uid.to_string()));
  Some(sender_filter)
}

pub fn build_profiles_users_filter(
  table: &str,
  visibility_str: &str,
  user_id: Option<&str>,
) -> Option<Filter> {
  if visibility_str == "private" {
    if let Some(uid) = user_id.filter(|u| !u.is_empty()) {
      let user_field = if table == "profiles" { "user_id" } else { "id" };
      let user_filter = Filter::Eq(user_field.to_string(), Value::String(uid.to_string()));
      Some(user_filter)
    } else {
      None
    }
  } else {
    None
  }
}

pub fn build_daily_activities_filter(user_id: Option<&str>) -> Option<Filter> {
  let uid = user_id.unwrap_or("");
  let user_filter = Filter::Eq("user_id".to_string(), Value::String(uid.to_string()));
  Some(user_filter)
}
