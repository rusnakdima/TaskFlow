use crate::models::response::{Response, Status};
use nosql_orm::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSchema {
  pub schema_version: String,
  pub app: AppConfig,
  pub pages: Vec<Page>,
  pub layouts: Vec<Layout>,
  pub components: Vec<ComponentDef>,
  #[serde(default)]
  pub shared_components: Vec<ComponentDef>,
  pub services: Vec<ServiceDef>,
  pub modules: Vec<ModuleDef>,
  pub i18n: I18nConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
  pub id: String,
  pub name: String,
  pub version: String,
  pub description: String,
  pub identifier: String,
  pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  pub default_locale: String,
  pub supported_locales: Vec<String>,
  pub tailwind_preset: String,
  pub theme: String,
  pub themes: Vec<String>,
  pub color_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
  pub id: String,
  pub name: String,
  pub route: String,
  pub layout: String,
  pub meta: PageMeta,
  #[serde(default)]
  pub sections: serde_json::Value,
  #[serde(default)]
  pub canvas_elements: Vec<CanvasElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
  pub title: String,
  pub icon: Option<String>,
  pub breadcrumb: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasElement {
  pub id: String,
  pub component_id: String,
  pub props: serde_json::Value,
  pub grid_position: GridPosition,
  pub data_binding: Option<DataBinding>,
  #[serde(default)]
  pub events: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridPosition {
  pub column: i32,
  pub row: i32,
  pub col_span: i32,
  pub row_span: i32,
  pub col_start: Option<i32>,
  pub row_start: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataBinding {
  pub entity: String,
  pub field: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
  pub id: String,
  pub name: String,
  pub slots: HashMap<String, LayoutSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSlot {
  pub name: String,
  pub elements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentDef {
  pub id: String,
  pub name: String,
  pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDef {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDef {
  pub id: String,
  pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct I18nConfig {
  pub locales: HashMap<String, LocaleMap>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleMap {
  pub nav: HashMap<String, String>,
  pub actions: HashMap<String, String>,
  pub messages: HashMap<String, String>,
}

pub struct SchemaService {
  provider: Arc<JsonProvider>,
  collection: String,
}

impl SchemaService {
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
          data: value,
        })
      }
      None => Ok(Response {
        status: Status::NotFound,
        message: format!("Schema {} not found", id),
        data: Value::Null,
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
      data,
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
      data: value,
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
      data: Value::Null,
    })
  }

  pub fn create_default_taskflow_schema() -> UiSchema {
    crate::schema_data::get_taskflow_schema()
  }
}
