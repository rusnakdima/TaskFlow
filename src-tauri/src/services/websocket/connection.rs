/* sys lib */
use futures_util::{SinkExt, StreamExt};
use serde_json::{from_str, to_string};
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};

/* models */
use crate::models::{
  response_model::ResponseModel,
  sync_metadata_model::SyncMetadata,
  websocket_model::{WsRequest, WsResponse},
};

/* websocket sub-modules */
use super::handlers::CrudHandlers;

/// WebSocket connection manager - handles individual client connections
pub struct ConnectionManager {
  crud_handlers: Arc<CrudHandlers>,
  clients: Arc<std::sync::Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>,
}

impl ConnectionManager {
  pub fn new(
    crud_handlers: Arc<CrudHandlers>,
    clients: Arc<std::sync::Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>,
  ) -> Self {
    Self {
      crud_handlers,
      clients,
    }
  }

  /// Handle incoming WebSocket connection
  pub async fn handle_connection(&self, stream: TcpStream) {
    let ws_stream = match accept_async(stream).await {
      Ok(ws) => ws,
      Err(_) => return,
    };

    let (tx, mut rx) = futures::channel::mpsc::unbounded();
    self.clients.lock().unwrap().push(tx.clone());

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    let send_task = tauri::async_runtime::spawn(async move {
      while let Some(msg) = rx.next().await {
        if ws_sender.send(msg).await.is_err() {
          break;
        }
      }
    });

    while let Some(msg) = ws_receiver.next().await {
      match msg {
        Ok(Message::Text(text)) => {
          let (response, request_id) = self.process_message(&text).await;
          let ws_response = WsResponse {
            requestId: request_id,
            response,
          };
          let response_json = to_string(&ws_response).unwrap_or_default();

          let _ = tx.unbounded_send(Message::Text(response_json.into()));
        }
        Ok(Message::Close(_)) => break,
        Err(_) => break,
        _ => (),
      }
    }

    send_task.abort();

    self.clients.lock().unwrap().retain(|client| !client.is_closed());
  }

  /// Process incoming WebSocket message
  async fn process_message(&self, text: &str) -> (ResponseModel, Option<String>) {
    let request: WsRequest = match from_str(text) {
      Ok(req) => req,
      Err(e) => {
        return (
          ResponseModel::from(format!("Invalid request format: {}", e)),
          None,
        );
      }
    };

    let request_id = request.requestId.clone();
    let sync_metadata = request.syncMetadata.clone().unwrap_or(SyncMetadata {
      isOwner: true,
      isPrivate: false,
    });

    let res = match request.action.as_str() {
      "get-all" => self.crud_handlers.handle_get_all(request, sync_metadata).await,
      "get" => self.crud_handlers.handle_get(request, sync_metadata).await,
      "create" => self.crud_handlers.handle_create(request, sync_metadata).await,
      "update" => self.crud_handlers.handle_update(request, sync_metadata).await,
      "update-all" => self.crud_handlers.handle_update_all(request, sync_metadata).await,
      "delete" => self.crud_handlers.handle_delete(request, sync_metadata).await,
      _ => ResponseModel::from(format!(
        "Unknown action: {} on {}",
        request.action, request.entity
      )),
    };

    (res, request_id)
  }
}
