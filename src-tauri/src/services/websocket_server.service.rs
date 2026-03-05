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
  response_model::{ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
  websocket_model::{WsBroadcast, WsRequest, WsResponse},
};

type Clients = Arc<Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>;

pub struct WebSocketServerService {
  pub crud_service: Arc<CrudService>,
  clients: Clients,
}

impl WebSocketServerService {
  pub fn new(crud_service: Arc<CrudService>) -> Self {
    Self {
      crud_service,
      clients: Arc::new(Mutex::new(Vec::new())),
    }
  }

  pub async fn start(self: Arc<Self>, port: u16) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr)
      .await
      .expect("Failed to bind to address");
    println!("WebSocket server listening on: {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
      let service_clone = self.clone();
      tauri::async_runtime::spawn(async move {
        service_clone.handle_connection(stream).await;
      });
    }
  }

  async fn handle_connection(&self, stream: TcpStream) {
    let ws_stream = match accept_async(stream).await {
      Ok(ws) => ws,
      Err(e) => {
        eprintln!("Error during WebSocket handshake: {}", e);
        return;
      }
    };

    let (tx, mut rx) = futures::channel::mpsc::unbounded();
    self.clients.lock().unwrap().push(tx.clone());

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    let send_task = tauri::async_runtime::spawn(async move {
      while let Some(msg) = rx.next().await {
        if let Err(e) = ws_sender.send(msg).await {
          eprintln!("Error sending message to client: {}", e);
          break;
        }
      }
    });

    while let Some(msg) = ws_receiver.next().await {
      match msg {
        Ok(Message::Text(text)) => {
          let (response, requestId) = self.process_message(&text).await;
          let ws_response = WsResponse {
            requestId,
            response,
          };
          let response_json = to_string(&ws_response).unwrap_or_default();

          let _ = tx.unbounded_send(Message::Text(response_json.into()));
        }
        Ok(Message::Close(_)) => break,
        Err(e) => {
          eprintln!("WebSocket error: {}", e);
          break;
        }
        _ => (),
      }
    }

    send_task.abort();
  }

  async fn process_message(&self, text: &str) -> (ResponseModel, Option<String>) {
    let request: WsRequest = match from_str(text) {
      Ok(req) => req,
      Err(e) => {
        return (
          ResponseModel::from(format!("Invalid request format: {}", e)),
          None,
        )
      }
    };

    let request_id = request.requestId.clone();

    let sync_metadata = request.syncMetadata.unwrap_or(SyncMetadata {
      isOwner: true,
      isPrivate: false,
    });

    let res = match (request.entity.as_str(), request.action.as_str()) {
      ("todo", "get-all") | ("task", "get-all") | ("subtask", "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crud_service
          .execute(
            "getAll".to_string(),
            format!("{}s", request.entity),
            None,
            None,
            Some(filter),
            None,
            Some(sync_metadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }
      ("todo", "get") | ("task", "get") | ("subtask", "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crud_service
          .execute(
            "read".to_string(),
            format!("{}s", request.entity),
            None,
            None,
            Some(filter),
            None,
            Some(sync_metadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }
      ("todo", "create") => {
        if let Some(data) = request.data {
          let res = self
            .crud_service
            .execute(
              "create".to_string(),
              "todos".to_string(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("todo-created", "todo", data);
          }
          res
        } else {
          ResponseModel::from("Missing data for create action".to_string())
        }
      }
      ("task", "create") => {
        if let Some(data) = request.data {
          let res = self
            .crud_service
            .execute(
              "create".to_string(),
              "tasks".to_string(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("task-created", "task", data);
          }
          res
        } else {
          ResponseModel::from("Missing data".to_string())
        }
      }
      ("subtask", "create") => {
        if let Some(data) = request.data {
          let res = self
            .crud_service
            .execute(
              "create".to_string(),
              "subtasks".to_string(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("subtask-created", "subtask", data);
          }
          res
        } else {
          ResponseModel::from("Missing data".to_string())
        }
      }
      ("todo", "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crud_service
            .execute(
              "update".to_string(),
              "todos".to_string(),
              Some(id.clone()),
              Some(data.clone()),
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("todo-updated", "todo", data);
          }
          res
        } else {
          ResponseModel::from("Missing id or data for update action".to_string())
        }
      }
      ("task", "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crud_service
            .execute(
              "update".to_string(),
              "tasks".to_string(),
              Some(id.clone()),
              Some(data.clone()),
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("task-updated", "task", data);
          }
          res
        } else {
          ResponseModel::from("Missing id for update action".to_string())
        }
      }
      ("subtask", "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crud_service
            .execute(
              "update".to_string(),
              "subtasks".to_string(),
              Some(id.clone()),
              Some(data.clone()),
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("subtask-updated", "subtask", data);
          }
          res
        } else {
          ResponseModel::from("Missing id or data".to_string())
        }
      }
      ("todo", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .crud_service
            .execute(
              "delete".to_string(),
              "todos".to_string(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("todo-deleted", "todo", json!({ "id": id }));
          }
          res
        } else {
          ResponseModel::from("Missing id for delete action".to_string())
        }
      }
      ("task", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .crud_service
            .execute(
              "delete".to_string(),
              "tasks".to_string(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("task-deleted", "task", json!({ "id": id }));
          }
          res
        } else {
          ResponseModel::from("Missing id".to_string())
        }
      }
      ("subtask", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .crud_service
            .execute(
              "delete".to_string(),
              "subtasks".to_string(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(sync_metadata),
            )
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            self.broadcast("subtask-deleted", "subtask", json!({ "id": id }));
          }
          res
        } else {
          ResponseModel::from("Missing id".to_string())
        }
      }
      _ => ResponseModel::from(format!(
        "Unknown action or entity: {} on {}",
        request.action, request.entity
      )),
    };

    (res, request_id)
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
