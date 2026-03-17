/* sys lib */
use serde_json::{json, Value};
use std::sync::Arc;

/* services */
use super::super::crud_service::CrudService;
use super::broadcast::BroadcastHelper;

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
  websocket_model::WsRequest,
};

/// WebSocket CRUD handlers - handles individual CRUD operations
pub struct CrudHandlers {
  crud_service: Arc<CrudService>,
  broadcast: BroadcastHelper,
}

impl CrudHandlers {
  pub fn new(crud_service: Arc<CrudService>, broadcast: BroadcastHelper) -> Self {
    Self {
      crud_service,
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
      .crud_service
      .execute(
        "getAll".to_string(),
        request.entity,
        None,
        None,
        Some(filter),
        request.relations,
        request.load,  // load parameter - now used in WebSocket
        Some(sync_metadata),
      )
      .await
      .unwrap_or_else(|e| e)
  }

  /// Handle get action
  pub async fn handle_get(&self, request: WsRequest, sync_metadata: SyncMetadata) -> ResponseModel {
    let filter = request.filter.unwrap_or(json!({}));
    self
      .crud_service
      .execute(
        "get".to_string(),
        request.entity,
        request.id,
        None,
        Some(filter),
        request.relations,
        request.load,  // load parameter - now used in WebSocket
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
        .crud_service
        .execute(
          "create".to_string(),
          request.entity.clone(),
          None,
          Some(data),
          None,
          None,
          None,  // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        if let DataValue::Object(ref obj) = res.data {
          self
            .broadcast
            .broadcast_created(&request.entity, obj.clone());
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
        .crud_service
        .execute(
          "update".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          Some(data),
          None,
          None,
          None,  // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        if let DataValue::Object(ref obj) = res.data {
          self
            .broadcast
            .broadcast_updated(&request.entity, obj.clone());
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
        .crud_service
        .execute(
          "updateAll".to_string(),
          request.entity.clone(),
          None,
          Some(data.clone()),
          None,
          None,
          None,  // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .unwrap_or_else(|e| e);

      if res.status == ResponseStatus::Success {
        if request.entity == "chats" {
          self.handle_chat_update_broadcast(&data);
        }
      }
      res
    } else {
      ResponseModel::from("Missing data for update-all action".to_string())
    }
  }

  /// Handle chat update special case (chat cleared)
  fn handle_chat_update_broadcast(&self, data: &Value) {
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
        .and_then(|first| first.get("todoId"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();

      if !todo_id.is_empty() {
        self.broadcast.broadcast_chat_cleared(todo_id);
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
      // Get original record for broadcast data
      let original = self
        .crud_service
        .execute(
          "get".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,  // load parameter
          Some(sync_metadata.clone()),
        )
        .await
        .ok();

      let res = self
        .crud_service
        .execute(
          "delete".to_string(),
          request.entity.clone(),
          Some(id.clone()),
          None,
          None,
          None,
          None,  // load parameter
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
          .broadcast_deleted(&request.entity, broadcast_data);
      }
      res
    } else {
      ResponseModel::from("Missing id for delete action".to_string())
    }
  }
}
