pub use tauri_shared::schema::UiSchema;

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

use crate::models::response::Response;

#[tauri::command]
pub async fn get_ui_schema(
  state: State<'_, SchemaState>,
  id: String,
) -> Result<Response<serde_json::Value>, String> {
  let result = state.schema_service.get_schema(&id).await.map_err(|e| e)?;
  let json_value: serde_json::Value = serde_json::to_value(result).map_err(|e| e.to_string())?;
  Ok(Response::success(json_value, Some("Schema loaded")))
}

#[tauri::command]
pub async fn save_ui_schema(
  state: State<'_, SchemaState>,
  id: String,
  schema: serde_json::Value,
) -> Result<Response<()>, String> {
  let mut schema: UiSchema = serde_json::from_value(schema).map_err(|e| e.to_string())?;
  schema.app.id = id;
  state
    .schema_service
    .save_schema(schema)
    .await
    .map_err(|e| e)?;
  Ok(Response::success((), Some("Schema saved")))
}

pub struct SchemaState {
  pub schema_service: Arc<SchemaService>,
}

impl SchemaState {
  #[allow(dead_code)]
  pub fn new(json_provider: JsonProvider) -> Self {
    Self {
      schema_service: Arc::new(SchemaService::new(Arc::new(json_provider))),
    }
  }
}
