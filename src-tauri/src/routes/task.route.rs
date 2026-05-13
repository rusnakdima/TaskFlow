use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::err_response;
use crate::shared::types::{TaskCreateRequest, TaskUpdateRequest};
use crate::AppState;
use tauri::State;

fn extract_user_id(
  state: &AppState,
  token: &Option<String>,
) -> Result<Option<String>, ResponseModel> {
  let user_id = token
    .as_ref()
    .and_then(|t| extract_user_from_token(t, &state.config_helper.jwt_secret).ok());
  Ok(user_id)
}

#[tauri::command]
pub async fn get_task(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");
  state.task_service.get_by_id(&id, user_id_str).await
}

#[tauri::command]
pub async fn get_tasks(
  state: State<'_, AppState>,
  page: Option<u64>,
  limit: Option<u64>,
  visibility: Option<String>,
  filter: Option<serde_json::Value>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());
  let user_id_str = user_id.as_deref().unwrap_or("");
  state
    .task_service
    .get_all(
      user_id_str,
      &visibility,
      filter,
      Some(page.unwrap_or(0) * limit.unwrap_or(10)),
      limit,
    )
    .await
}

#[tauri::command]
pub async fn create_task(
  state: State<'_, AppState>,
  data: TaskCreateRequest,
  visibility: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let visibility = visibility.unwrap_or_else(|| "private".to_string());
  let user_id_str = user_id.as_deref().unwrap_or("");

  let mut doc = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  if let Some(obj) = doc.as_object_mut() {
    obj.insert(
      "created_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.insert(
      "updated_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.insert("subtasks_count".to_string(), serde_json::json!(0));
    obj.insert("completed_subtasks_count".to_string(), serde_json::json!(0));
    obj.insert("comments_count".to_string(), serde_json::json!(0));
    obj.insert("status".to_string(), serde_json::json!("pending"));
  }

  state
    .task_service
    .create(doc, &visibility, user_id_str)
    .await
}

#[tauri::command]
pub async fn update_task(
  state: State<'_, AppState>,
  id: String,
  data: TaskUpdateRequest,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");

  let mut doc = serde_json::to_value(&data).map_err(|e| err_response(&e.to_string()))?;

  if let Some(obj) = doc.as_object_mut() {
    obj.insert(
      "updated_at".to_string(),
      serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );
    obj.remove("user_id");
    obj.remove("todo_id");
  }

  state.task_service.update(&id, doc, user_id_str).await
}

#[tauri::command]
pub async fn delete_task(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_id(&state, &token)?;
  let user_id_str = user_id.as_deref().unwrap_or("");
  state.task_service.delete(&id, user_id_str).await
}
