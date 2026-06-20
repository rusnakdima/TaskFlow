use crate::models::response::ResponseModel;
use crate::services::crud_service::CrudService;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn crud_execute(
  operation: String,
  entity: String,
  id: Option<String>,
  data: Option<serde_json::Value>,
  filter: Option<serde_json::Value>,
  state: State<'_, Arc<CrudService>>,
) -> Result<ResponseModel, String> {
  state
    .execute(&operation, &entity, id.as_deref(), data, filter)
    .await
    .map_err(|e| e.to_string())
}
