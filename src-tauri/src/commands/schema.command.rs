use crate::AppState;
use nosql_orm::provider::DatabaseProvider;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaResponse {
  #[serde(rename = "status")]
  pub status: String,
  #[serde(rename = "message")]
  pub message: Option<String>,
  #[serde(rename = "data")]
  pub data: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn get_schema(id: String, state: State<'_, AppState>) -> Result<SchemaResponse, String> {
  let schema = state
    .config
    .json_provider
    .find_by_id("schemas", &id)
    .await
    .map_err(|e| e.to_string())?;

  match schema {
    Some(data) => Ok(SchemaResponse {
      status: "success".to_string(),
      message: None,
      data: Some(data),
    }),
    None => Ok(SchemaResponse {
      status: "notFound".to_string(),
      message: Some(format!("Schema '{}' not found", id)),
      data: None,
    }),
  }
}
