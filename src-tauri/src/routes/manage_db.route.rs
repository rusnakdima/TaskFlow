/* sys lib */
use crate::AppState;
use serde_json::Value;
use tauri::State;

/* models */
use crate::entities::relation_obj::RelationObj;
use crate::entities::response_entity::ResponseModel;
use crate::entities::sync_metadata_entity::SyncMetadata;

// ==================== GENERIC CRUD ENDPOINT ====================

#[tauri::command]
pub async fn manageData(
  state: State<'_, AppState>,
  operation: String,
  table: String,
  id: Option<String>,
  data: Option<Value>,
  filter: Option<Value>,
  relations: Option<Vec<RelationObj>>,
  load: Option<Vec<String>>,
  syncMetadata: Option<SyncMetadata>,
) -> Result<ResponseModel, ResponseModel> {
  state
    .repositoryService
    .execute(
      operation,
      table,
      id,
      data,
      filter,
      relations,
      load,
      syncMetadata,
    )
    .await
}

// ==================== SYNC OPERATIONS ====================

#[tauri::command]
pub async fn importToLocal(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  state.manageDbService.importToLocal(userId).await
}

#[tauri::command]
pub async fn exportToCloud(
  state: State<'_, AppState>,
  userId: String,
) -> Result<ResponseModel, ResponseModel> {
  state.manageDbService.exportToCloud(userId).await
}

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

/// Get all data from local JSON for Archive page (all users, includes deleted)
#[tauri::command]
pub async fn getAllDataForArchive(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.manageDbService.getAllDataForArchive().await
}

/// Get all data for admin from MongoDB (global view with all users' data)
#[tauri::command]
pub async fn getAllDataForAdmin(
  state: State<'_, AppState>,
) -> Result<ResponseModel, ResponseModel> {
  state.manageDbService.getAllDataForAdmin().await
}

#[tauri::command]
pub async fn permanentlyDeleteRecord(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manageDbService
    .permanentlyDeleteRecord(table, id)
    .await
}

#[tauri::command]
pub async fn toggleDeleteStatus(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state.manageDbService.toggleDeleteStatus(table, id).await
}

#[tauri::command]
pub async fn toggleDeleteStatusLocal(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manageDbService
    .toggleDeleteStatusLocal(table, id)
    .await
}

#[tauri::command]
pub async fn permanentlyDeleteRecordLocal(
  state: State<'_, AppState>,
  table: String,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  state
    .manageDbService
    .permanentlyDeleteRecordLocal(table, id)
    .await
}
