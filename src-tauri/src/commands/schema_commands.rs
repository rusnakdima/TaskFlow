use crate::models::response::{Response, ResponseModel, Status};
use crate::services::schema_service::{SchemaService, UiSchema};
use tauri::State;

use super::schema_command::SchemaState;

#[tauri::command]
pub async fn get_taskflow_schema(state: State<'_, SchemaState>) -> Result<ResponseModel, String> {
  let result = state
    .schema_service
    .get_schema("taskflow")
    .await
    .map_err(|e| e)?;

  if result.status == Status::NotFound {
    let default_schema = SchemaService::create_default_taskflow_schema();
    state
      .schema_service
      .save_schema(default_schema.clone())
      .await
      .map_err(|e| e)?;
    Ok(Response::success(
      "Default schema created",
      serde_json::to_value(default_schema).map_err(|e| e.to_string())?,
    ))
  } else {
    let schema: UiSchema =
      serde_json::from_value(result.data.clone()).map_err(|e| e.to_string())?;
    Ok(Response::success(
      "Schema retrieved",
      serde_json::to_value(schema).map_err(|e| e.to_string())?,
    ))
  }
}

#[tauri::command]
pub async fn save_taskflow_schema(
  state: State<'_, SchemaState>,
  schema: UiSchema,
) -> Result<ResponseModel, String> {
  let mut schema_to_save = schema;
  schema_to_save.app.id = "taskflow".to_string();

  state
    .schema_service
    .save_schema(schema_to_save)
    .await
    .map_err(|e| e)?;

  Ok(Response::success(
    "Schema saved",
    serde_json::json!({ "saved": true }),
  ))
}
