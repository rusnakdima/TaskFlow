/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;

/* services */
use super::super::repository_service::RepositoryService;
use super::broadcast::BroadcastHelper;

/* models */
use crate::entities::{
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_entity::SyncMetadata,
  websocket_entity::WsRequest,
};

/// WebSocket CRUD handlers - handles individual CRUD operations
pub struct CrudHandlers {
  repository_service: Arc<RepositoryService>,
  broadcast: BroadcastHelper,
}

impl CrudHandlers {
  pub fn new(repository_service: Arc<RepositoryService>, broadcast: BroadcastHelper) -> Self {
    Self {
      repository_service,
      broadcast,
    }
  }

  /// Handle get-all action
  pub async fn handle_get_all(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    let filter = request.filter.unwrap_or(json!({}));
    self
      .repository_service
      .execute(
        "getAll".to_string(),
        request.entity,
        None,
        None,
        Some(filter),
        request.relations,
        request.load, // load parameter - now used in WebSocket
        Some(sync_metadata),
      )
      .await
      .unwrap_or_else(|e| e)
  }

  /// Handle get action
  pub async fn handle_get(&self, request: WsRequest, sync_metadata: SyncMetadata) -> ResponseModel {
    let filter = request.filter.unwrap_or(json!({}));
    self
      .repository_service
      .execute(
        "get".to_string(),
        request.entity,
        request.id,
        None,
        Some(filter),
        request.relations,
        request.load, // load parameter - now used in WebSocket
        Some(sync_metadata),
      )
      .await
      .unwrap_or_else(|e| e)
  }

  /// Handle create action with broadcast
  pub async fn handle_create(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let Some(data) = request.data {
      let res = self
        .repository_service
        .execute(
          "create".to_string(),
          request.entity.clone(),
          None,
          Some(data),
          None,
          None,
          None, // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        if let DataValue::Object(ref obj) = res.data {
          self
            .broadcast
            .broadcast_created(&request.entity, obj.clone())
            .await;
        }
      }
      res
    } else {
      ResponseModel::from("Missing data for create action".to_string())
    }
  }

  /// Handle update action with broadcast
  pub async fn handle_update(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let (Some(id), Some(data)) = (request.id, request.data) {
      let res = self
        .repository_service
        .execute(
          "update".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          Some(data),
          None,
          None,
          None, // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        if let DataValue::Object(ref obj) = res.data {
          self
            .broadcast
            .broadcast_updated(&request.entity, obj.clone())
            .await;
        }
      }
      res
    } else {
      ResponseModel::from("Missing id or data for update action".to_string())
    }
  }

  /// Handle update-all action with special broadcast
  pub async fn handle_update_all(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let Some(data) = request.data {
      let res = self
        .repository_service
        .execute(
          "updateAll".to_string(),
          request.entity.clone(),
          None,
          Some(data.clone()),
          None,
          None,
          None, // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        if request.entity == "chats" {
          self.handle_chat_update_broadcast(&data).await;
        } else {
          // Broadcast bulk-update for all other entities (M-7)
          if let Some(arr) = data.as_array() {
            for item in arr {
              if let Some(obj) = item.as_object() {
                self
                  .broadcast
                  .broadcast_updated(&request.entity, serde_json::Value::Object(obj.clone()))
                  .await;
              }
            }
          }
        }
      }
      res
    } else {
      ResponseModel::from("Missing data for update-all action".to_string())
    }
  }

  /// Handle chat update special case (chat cleared)
  async fn handle_chat_update_broadcast(&self, data: &Value) {
    let is_clear = data
      .as_array()
      .and_then(|arr| arr.get(0))
      .and_then(|first| first.get("isDeleted"))
      .and_then(|v| v.as_bool())
      .unwrap_or(false);

    if is_clear {
      let todo_id = data
        .as_array()
        .and_then(|arr| arr.get(0))
        .and_then(|first| first.get("todo_id"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();

      if !todo_id.is_empty() {
        self.broadcast.broadcast_chat_cleared(todo_id).await;
      }
    }
  }

  /// Handle delete action with broadcast
  pub async fn handle_delete(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let Some(id) = request.id {
      let original = self
        .repository_service
        .execute(
          "get".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,
          Some(sync_metadata.clone()),
        )
        .await
        .ok();

      let operation = if request.is_permanent == Some(true) {
        "permanent-delete"
      } else if request.is_cascade == Some(true) {
        "soft-delete-cascade"
      } else {
        "delete"
      };

      let res = self
        .repository_service
        .execute(
          operation.to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        let broadcast_data = if let Some(orig_response) = original {
          match orig_response.data {
            DataValue::Object(obj) => obj.clone(),
            _ => json!({ "id": id }),
          }
        } else {
          json!({ "id": id })
        };

        self
          .broadcast
          .broadcast_deleted(&request.entity, broadcast_data)
          .await;
      }
      res
    } else {
      ResponseModel::from("Missing id for delete action".to_string())
    }
  }

  /// Handle restore action with broadcast (M-8)
  pub async fn handle_restore(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let Some(id) = request.id {
      let res = self
        .repository_service
        .execute(
          "restore".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        let restored = self
          .repository_service
          .execute(
            "get".to_string(),
            request.entity.clone(),
            Some(id.clone()),
            None,
            None,
            None,
            None,
            Some(sync_metadata),
          )
          .await
          .ok();

        let broadcast_data = if let Some(r) = restored {
          match r.data {
            DataValue::Object(obj) => obj,
            _ => json!({ "id": id }),
          }
        } else {
          json!({ "id": id })
        };

        self
          .broadcast
          .broadcast_restored(&request.entity, broadcast_data)
          .await;
      }
      res
    } else {
      ResponseModel::from("Missing id for restore action".to_string())
    }
  }

  /// Handle restore with cascade
  pub async fn handle_restore_cascade(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let Some(id) = request.id {
      let res = self
        .repository_service
        .execute(
          "restore-cascade".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        let restored = self
          .repository_service
          .execute(
            "get".to_string(),
            request.entity.clone(),
            Some(id.clone()),
            None,
            None,
            None,
            None,
            Some(sync_metadata),
          )
          .await
          .ok();

        let broadcast_data = if let Some(r) = restored {
          match r.data {
            DataValue::Object(obj) => obj,
            _ => json!({ "id": id }),
          }
        } else {
          json!({ "id": id })
        };

        self
          .broadcast
          .broadcast_restored(&request.entity, broadcast_data)
          .await;
      }
      res
    } else {
      ResponseModel::from("Missing id for restore-cascade action".to_string())
    }
  }

  /// Handle sync to provider
  pub async fn handle_sync_to_provider(
    &self,
    request: WsRequest,
    sync_metadata: SyncMetadata,
  ) -> ResponseModel {
    if let Some(id) = request.id {
      self
        .repository_service
        .execute(
          "sync-to-provider".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e)
    } else {
      ResponseModel::from("Missing id for sync-to-provider action".to_string())
    }
  }
}
