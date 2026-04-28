use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::query::Filter;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::entities::pending_request_entity::{
  PendingRequestEntity, ProcessQueueResult, QueueError,
};
use crate::entities::sync_metadata_entity::SyncMetadata;
use crate::services::repository_service::RepositoryService;

pub struct OfflineQueueService {
  json_provider: JsonProvider,
  repository_service: Arc<RepositoryService>,
  max_retries: i32,
}

impl OfflineQueueService {
  pub fn new(
    json_provider: JsonProvider,
    repository_service: Arc<RepositoryService>,
    max_retries: i32,
  ) -> Self {
    Self {
      json_provider,
      repository_service,
      max_retries,
    }
  }

  pub async fn queue_request(
    &self,
    operation: String,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    filter: Option<Value>,
    sync_metadata: Option<SyncMetadata>,
  ) -> Result<String, String> {
    let pending_request = PendingRequestEntity::new(
      operation,
      table,
      id,
      data,
      filter,
      sync_metadata.and_then(|m| serde_json::to_value(m).ok()),
    );

    let sync_metadata_json = pending_request.sync_metadata.clone();
    let pending_value = serde_json::to_value(pending_request)
      .map_err(|e| format!("Failed to serialize request: {}", e))?;

    let saved: Value = self
      .json_provider
      .insert("pending_requests", pending_value)
      .await
      .map_err(|e| format!("Failed to queue request: {}", e))?;

    let id_str = saved
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or_else(|| "No ID returned from insert".to_string())?;

    tracing::info!(
      "[OfflineQueue] Request queued: operation={}, table={}, queue_id={}",
      sync_metadata_json.as_ref().map_or("", |_| ""),
      "",
      id_str
    );

    Ok(id_str.to_string())
  }

  pub async fn get_pending_count(&self) -> usize {
    let filter_json = json!({
      "status": { "$eq": "pending" }
    });
    let filter = Filter::from_json(&filter_json);

    match filter {
      Ok(f) => match self
        .json_provider
        .find_many("pending_requests", Some(&f), None, None, None, false)
        .await
      {
        Ok(items) => items.len(),
        Err(_) => 0,
      },
      Err(_) => 0,
    }
  }

  pub async fn process_queue(&self) -> ProcessQueueResult {
    let filter_json = json!({
      "status": { "$eq": "pending" }
    });
    let filter = match Filter::from_json(&filter_json) {
      Ok(f) => f,
      Err(e) => {
        tracing::error!("[OfflineQueue] Failed to create filter: {}", e);
        return ProcessQueueResult {
          processed: 0,
          succeeded: 0,
          failed: 0,
          errors: vec![],
        };
      }
    };

    let pending_items = match self
      .json_provider
      .find_many("pending_requests", Some(&filter), None, None, None, false)
      .await
    {
      Ok(items) => items,
      Err(e) => {
        tracing::error!("[OfflineQueue] Failed to fetch pending requests: {}", e);
        return ProcessQueueResult {
          processed: 0,
          succeeded: 0,
          failed: 0,
          errors: vec![],
        };
      }
    };

    let mut result = ProcessQueueResult {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: vec![],
    };

    for item in pending_items {
      let queue_id = item
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
      let operation = item
        .get("operation")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      let table = item
        .get("table")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

      tracing::debug!(
        "[OfflineQueue] Processing: queue_id={}, operation={}, table={}",
        queue_id,
        operation,
        table
      );

      if let Err(e) = self.update_status(&queue_id, "processing").await {
        tracing::warn!(
          "[OfflineQueue] Failed to update status to processing: {}",
          e
        );
        continue;
      }

      let id = item
        .get("record_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
      let data = item.get("data").cloned();
      let filter_val = item.get("filter").cloned();
      let sync_metadata = item
        .get("sync_metadata")
        .and_then(|v| serde_json::from_value::<SyncMetadata>(v.clone()).ok());

      let exec_result = self
        .repository_service
        .execute(
          operation.clone(),
          table.clone(),
          id,
          data,
          filter_val,
          None,
          None,
          sync_metadata,
        )
        .await;

      match exec_result {
        Ok(_) => {
          if let Err(e) = self.update_status(&queue_id, "completed").await {
            tracing::warn!("[OfflineQueue] Failed to update status to completed: {}", e);
          }
          result.succeeded += 1;
          tracing::info!(
            "[OfflineQueue] Successfully processed: queue_id={}",
            queue_id
          );
        }
        Err(e) => {
          let error_str = format!("{:?}", e);
          let is_conflict = error_str.contains("not found")
            || error_str.contains("Document not found")
            || error_str.contains("No document found");

          if is_conflict {
            if let Err(e) = self
              .update_with_error(&queue_id, "failed", Some(error_str.clone()))
              .await
            {
              tracing::warn!("[OfflineQueue] Failed to update failed status: {}", e);
            }
            result.failed += 1;
            result.errors.push(QueueError {
              queue_id,
              operation,
              error: error_str,
            });
          } else {
            let current_retry = item
              .get("retry_count")
              .and_then(|v| v.as_i64())
              .unwrap_or(0) as i32;
            let new_retry = current_retry + 1;

            if new_retry >= self.max_retries {
              if let Err(e) = self
                .update_with_error(
                  &queue_id,
                  "failed",
                  Some(format!("Max retries exceeded: {}", error_str)),
                )
                .await
              {
                tracing::warn!("[OfflineQueue] Failed to update max retries status: {}", e);
              }
              result.failed += 1;
              result.errors.push(QueueError {
                queue_id,
                operation,
                error: format!("Max retries exceeded: {}", error_str),
              });
            } else {
              if let Err(e) = self
                .update_with_retry(&queue_id, new_retry, Some(error_str.clone()))
                .await
              {
                tracing::warn!("[OfflineQueue] Failed to update retry status: {}", e);
              }
              tracing::warn!(
                "[OfflineQueue] Transient failure, will retry: queue_id={}, retries={}/{}",
                queue_id,
                new_retry,
                self.max_retries
              );
            }
          }
        }
      }

      result.processed += 1;
    }

    tracing::info!(
      "[OfflineQueue] Queue processing complete: processed={}, succeeded={}, failed={}",
      result.processed,
      result.succeeded,
      result.failed
    );

    result
  }

  async fn update_status(&self, queue_id: &str, status: &str) -> Result<(), String> {
    let patch = json!({
      "status": status
    });
    let _: Value = self
      .json_provider
      .patch("pending_requests", queue_id, patch)
      .await
      .map_err(|e| format!("Failed to update status: {}", e))?;
    Ok(())
  }

  async fn update_with_error(
    &self,
    queue_id: &str,
    status: &str,
    error: Option<String>,
  ) -> Result<(), String> {
    let mut patch = json!({
      "status": status
    });
    if let Some(err) = error {
      patch["error_message"] = json!(err);
    }
    let _: Value = self
      .json_provider
      .patch("pending_requests", queue_id, patch)
      .await
      .map_err(|e| format!("Failed to update status with error: {}", e))?;
    Ok(())
  }

  async fn update_with_retry(
    &self,
    queue_id: &str,
    retry_count: i32,
    error: Option<String>,
  ) -> Result<(), String> {
    let mut patch = json!({
      "status": "pending",
      "retry_count": retry_count
    });
    if let Some(err) = error {
      patch["error_message"] = json!(err);
    }
    let _: Value = self
      .json_provider
      .patch("pending_requests", queue_id, patch)
      .await
      .map_err(|e| format!("Failed to update retry status: {}", e))?;
    Ok(())
  }
}
