use crate::models::response::{Response, Status};
use nosql_orm::prelude::*;
use serde_json::Value;
use std::sync::Arc;
use tauri_shared::schema::UiSchema;

pub struct SchemaService {
  provider: Arc<JsonProvider>,
  collection: String,
}

impl SchemaService {
  #[allow(dead_code)]
  pub fn new(provider: Arc<JsonProvider>) -> Self {
    Self {
      provider,
      collection: "schemas".to_string(),
    }
  }

  pub async fn get_schema(&self, id: &str) -> Result<Response<Value>, String> {
    let result = self
      .provider
      .find_by_id(&self.collection, id)
      .await
      .map_err(|e| e.to_string())?;

    match result {
      Some(data) => {
        let schema: UiSchema = serde_json::from_value(data.clone()).map_err(|e| e.to_string())?;
        let value = serde_json::to_value(&schema).map_err(|e| e.to_string())?;
        Ok(Response {
          status: Status::Success,
          message: "Schema found".to_string(),
          data: Some(value),
        })
      }
      None => Ok(Response {
        status: Status::NotFound,
        message: format!("Schema {} not found", id),
        data: Some(Value::Null),
      }),
    }
  }

  pub async fn save_schema(&self, schema: UiSchema) -> Result<Response<Value>, String> {
    let id = schema.app.id.clone();
    let data = serde_json::to_value(&schema).map_err(|e| e.to_string())?;

    let existing = self
      .provider
      .find_by_id(&self.collection, &id)
      .await
      .map_err(|e| e.to_string())?;

    if existing.is_some() {
      self
        .provider
        .update(&self.collection, &id, data.clone())
        .await
        .map_err(|e| e.to_string())?;
    } else {
      self
        .provider
        .insert(&self.collection, data.clone())
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(Response {
      status: Status::Success,
      message: "Schema saved".to_string(),
      data: Some(data),
    })
  }

  pub async fn get_all_schemas(&self) -> Result<Response<Value>, String> {
    let results = self
      .provider
      .find_all(&self.collection)
      .await
      .map_err(|e| e.to_string())?;

    let schemas: Vec<UiSchema> = results
      .into_iter()
      .filter_map(|data| serde_json::from_value(data).ok())
      .collect();

    let value = serde_json::to_value(&schemas).map_err(|e| e.to_string())?;
    Ok(Response {
      status: Status::Success,
      message: format!("Found {} schemas", schemas.len()),
      data: Some(value),
    })
  }

  pub async fn delete_schema(&self, id: &str) -> Result<Response<Value>, String> {
    self
      .provider
      .delete(&self.collection, id)
      .await
      .map_err(|e| e.to_string())?;

    Ok(Response {
      status: Status::Success,
      message: format!("Schema {} deleted", id),
      data: Some(Value::Null),
    })
  }
}
