// Re-export types from schema_service for use by Tauri commands
pub use crate::services::schema_service::{
  AppConfig, AppSettings, CanvasElement, ComponentDef, DataBinding, GridPosition, I18nConfig,
  Layout, LayoutSlot, LocaleMap, ModuleDef, Page, PageMeta, ServiceDef, UiSchema,
};

use crate::models::response::ResponseModel;
use crate::services::schema_service::SchemaService;
use nosql_orm::prelude::JsonProvider;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_schema(
  state: State<'_, SchemaState>,
  id: String,
) -> Result<ResponseModel, String> {
  state.schema_service.get_schema(&id).await.map_err(|e| e)
}

#[tauri::command]
pub async fn save_schema(
  state: State<'_, SchemaState>,
  schema: UiSchema,
) -> Result<ResponseModel, String> {
  state
    .schema_service
    .save_schema(schema)
    .await
    .map_err(|e| e)
}

#[tauri::command]
pub async fn get_all_schemas(state: State<'_, SchemaState>) -> Result<ResponseModel, String> {
  state.schema_service.get_all_schemas().await.map_err(|e| e)
}

#[tauri::command]
pub async fn delete_schema(
  state: State<'_, SchemaState>,
  id: String,
) -> Result<ResponseModel, String> {
  state.schema_service.delete_schema(&id).await.map_err(|e| e)
}

pub struct SchemaState {
  pub schema_service: Arc<SchemaService>,
}

impl SchemaState {
  pub fn new(json_provider: JsonProvider) -> Self {
    Self {
      schema_service: Arc::new(SchemaService::new(Arc::new(json_provider))),
    }
  }
}
