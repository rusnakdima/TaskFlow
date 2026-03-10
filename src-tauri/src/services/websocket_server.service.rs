/* sys lib */
use futures_util::{SinkExt, StreamExt};
use serde_json::{from_str, json, to_string, Value};
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};

/* services */
use crate::services::crud_service::CrudService;

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
  websocket_model::{WsBroadcast, WsRequest, WsResponse},
};

type Clients = Arc<Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>;

pub struct WebSocketServerService {
  pub crudService: Arc<CrudService>,
  clients: Clients,
}

impl WebSocketServerService {
  pub fn new(crudService: Arc<CrudService>) -> Self {
    Self {
      crudService,
      clients: Arc::new(Mutex::new(Vec::new())),
    }
  }

  pub async fn start(self: Arc<Self>, port: u16) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr)
      .await
      .expect("Failed to bind to address");

    while let Ok((stream, _)) = listener.accept().await {
      let serviceClone = self.clone();
      tauri::async_runtime::spawn(async move {
        serviceClone.handleConnection(stream).await;
      });
    }
  }

  async fn handleConnection(&self, stream: TcpStream) {
    let wsStream = match accept_async(stream).await {
      Ok(ws) => ws,
      Err(_) => {
        return;
      }
    };

    let (tx, mut rx) = futures::channel::mpsc::unbounded();
    self.clients.lock().unwrap().push(tx.clone());

    let (mut wsSender, mut wsReceiver) = wsStream.split();

    let sendTask = tauri::async_runtime::spawn(async move {
      while let Some(msg) = rx.next().await {
        if let Err(_) = wsSender.send(msg).await {
          break;
        }
      }
    });

    while let Some(msg) = wsReceiver.next().await {
      match msg {
        Ok(Message::Text(text)) => {
          let (response, requestId) = self.processMessage(&text).await;
          let wsResponse = WsResponse {
            requestId,
            response,
          };
          let responseJson = to_string(&wsResponse).unwrap_or_default();

          let _ = tx.unbounded_send(Message::Text(responseJson.into()));
        }
        Ok(Message::Close(_)) => break,
        Err(_) => {
          break;
        }
        _ => (),
      }
    }

    sendTask.abort();
  }

  fn getBroadcastName(entity: &str) -> String {
    match entity {
      "todos" => "todo".to_string(),
      "tasks" => "task".to_string(),
      "subtasks" => "subtask".to_string(),
      "chats" => "chat".to_string(),
      "comments" => "comment".to_string(),
      s => s.to_string(),
    }
  }

  async fn processMessage(&self, text: &str) -> (ResponseModel, Option<String>) {
    let request: WsRequest = match from_str(text) {
      Ok(req) => req,
      Err(e) => {
        return (
          ResponseModel::from(format!("Invalid request format: {}", e)),
          None,
        );
      }
    };

    let requestId = request.requestId.clone();
    let syncMetadata = request.syncMetadata.unwrap_or(SyncMetadata {
      isOwner: true,
      isPrivate: false,
    });

    let res = match request.action.as_str() {
      "get-all" => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "getAll".to_string(),
            request.entity.clone(),
            None,
            None,
            Some(filter),
            request.relations,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      "get" => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "read".to_string(),
            request.entity.clone(),
            None,
            None,
            Some(filter),
            request.relations,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      "create" => {
        if let Some(data) = request.data {
          let res = self
            .crudService
            .execute(
              "create".to_string(),
              request.entity.clone(),
              None,
              Some(data),
              None,
              None,
              Some(syncMetadata.clone()),
            )
            .await
            .unwrap_or_else(|e| e);

          if res.status == ResponseStatus::Success {
            if let DataValue::Object(ref obj) = res.data {
              let broadcastEntity = Self::getBroadcastName(&request.entity);
              self.broadcast(
                &format!("{}-created", broadcastEntity),
                &broadcastEntity,
                obj.clone(),
              );
            }
          }
          res
        } else {
          ResponseModel::from("Missing data for create action".to_string())
        }
      }

      "update" => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crudService
            .execute(
              "update".to_string(),
              request.entity.clone(),
              Some(id.clone()),
              Some(data),
              None,
              None,
              Some(syncMetadata.clone()),
            )
            .await
            .unwrap_or_else(|e| e);

          if res.status == ResponseStatus::Success {
            if let DataValue::Object(ref obj) = res.data {
              let broadcastEntity = Self::getBroadcastName(&request.entity);
              self.broadcast(
                &format!("{}-updated", broadcastEntity),
                &broadcastEntity,
                obj.clone(),
              );
            }
          }
          res
        } else {
          ResponseModel::from("Missing id or data for update action".to_string())
        }
      }

      "update-all" => {
        if let Some(data) = request.data {
          let res = self
            .crudService
            .execute(
              "updateAll".to_string(),
              request.entity.clone(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata.clone()),
            )
            .await
            .unwrap_or_else(|e| e);

          if res.status == ResponseStatus::Success {
            if request.entity == "chats" {
              // Check if this was a clear operation (isDeleted: true) or just marking as read
              let isClear = data
                .as_array()
                .and_then(|arr| arr.get(0))
                .and_then(|first| first.get("isDeleted"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

              if isClear {
                let todoId = data
                  .as_array()
                  .and_then(|arr| arr.get(0))
                  .and_then(|first| first.get("todoId"))
                  .and_then(|v| v.as_str())
                  .unwrap_or_default();

                if !todoId.is_empty() {
                  self.broadcast("chat-cleared", "chat", json!({ "todoId": todoId }));
                }
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing data for update-all action".to_string())
        }
      }

      "delete" => {
        if let Some(id) = request.id {
          // Get the original data before deletion for broadcast
          let original = self
            .crudService
            .execute(
              "read".to_string(),
              request.entity.clone(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(syncMetadata.clone()),
            )
            .await
            .ok();

          let res = self
            .crudService
            .execute(
              "delete".to_string(),
              request.entity.clone(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(syncMetadata.clone()),
            )
            .await
            .unwrap_or_else(|e| e);

          if res.status == ResponseStatus::Success {
            let broadcastEntity = Self::getBroadcastName(&request.entity);
            // Include original data in broadcast for proper notifications
            let broadcastData = if let Some(orig_response) = original {
              match orig_response.data {
                DataValue::Object(obj) => obj.clone(),
                _ => json!({ "id": id })
              }
            } else {
              json!({ "id": id })
            };
            
            self.broadcast(
              &format!("{}-deleted", broadcastEntity),
              &broadcastEntity,
              broadcastData,
            );
          }
          res
        } else {
          ResponseModel::from("Missing id for delete action".to_string())
        }
      }

      _ => ResponseModel::from(format!(
        "Unknown action: {} on {}",
        request.action, request.entity
      )),
    };

    (res, requestId)
  }

  fn broadcast(&self, event: &str, entity: &str, data: Value) {
    let broadcast = WsBroadcast {
      event: event.to_string(),
      entity: entity.to_string(),
      data,
    };
    let json = to_string(&broadcast).unwrap_or_default();
    let msg = Message::Text(json.into());

    let mut clients = self.clients.lock().unwrap();
    clients.retain(|client| client.unbounded_send(msg.clone()).is_ok());
  }
}
