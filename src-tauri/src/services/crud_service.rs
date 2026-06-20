use crate::models::response::Response;
use nosql_orm::prelude::*;
use serde_json::Value;
use std::sync::Arc;

pub struct CrudService {
  provider: Arc<JsonProvider>,
}

impl CrudService {
  pub fn new(provider: JsonProvider) -> Self {
    Self {
      provider: Arc::new(provider),
    }
  }

  pub async fn execute(
    &self,
    operation: &str,
    entity: &str,
    id: Option<&str>,
    data: Option<Value>,
    _filter: Option<Value>,
  ) -> Result<Response<Value>, String> {
    match operation {
      "get" => {
        let id = id.ok_or("ID required for get")?;
        let result = self
          .provider
          .find_by_id(entity, id)
          .await
          .map_err(|e| e.to_string())?;
        match result {
          Some(data) => Ok(Response::success("Found", data)),
          None => Ok(Response::not_found(entity)),
        }
      }
      "get_all" => {
        let results = self
          .provider
          .find_all(entity)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::success("Found", Value::Array(results)))
      }
      "create" | "save" => {
        let data = data.ok_or("Data required for create")?;
        let result = self
          .provider
          .insert(entity, data)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::created(result))
      }
      "update" => {
        let id = id.ok_or("ID required for update")?;
        let mut data = data.ok_or("Data required for update")?;
        if let Some(obj) = data.as_object_mut() {
          obj.insert("id".to_string(), Value::String(id.to_string()));
        }
        let result = self
          .provider
          .update(entity, id, data)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::updated(result))
      }
      "patch" => {
        let id = id.ok_or("ID required for patch")?;
        let patch = data.ok_or("Patch data required")?;
        let result = self
          .provider
          .patch(entity, id, patch)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::updated(result))
      }
      "delete" => {
        let id = id.ok_or("ID required for delete")?;
        self
          .provider
          .delete(entity, id)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::deleted(serde_json::Value::Null))
      }
      "count" => {
        let count = self
          .provider
          .count(entity, None)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::success("Count", serde_json::json!(count)))
      }
      "exists" => {
        let id = id.ok_or("ID required for exists")?;
        let exists = self
          .provider
          .exists(entity, id)
          .await
          .map_err(|e| e.to_string())?;
        Ok(Response::success(
          if exists { "Exists" } else { "Not found" },
          serde_json::json!(exists),
        ))
      }
      _ => Err(format!("Unknown operation: {}", operation)),
    }
  }
}
