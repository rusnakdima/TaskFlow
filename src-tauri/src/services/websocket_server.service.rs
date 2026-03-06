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
    println!("WebSocket server listening on: {}", addr);

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
      Err(e) => {
        eprintln!("Error during WebSocket handshake: {}", e);
        return;
      }
    };

    let (tx, mut rx) = futures::channel::mpsc::unbounded();
    self.clients.lock().unwrap().push(tx.clone());

    let (mut wsSender, mut wsReceiver) = wsStream.split();

    let sendTask = tauri::async_runtime::spawn(async move {
      while let Some(msg) = rx.next().await {
        if let Err(e) = wsSender.send(msg).await {
          eprintln!("Error sending message to client: {}", e);
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
        Err(e) => {
          eprintln!("WebSocket error: {}", e);
          break;
        }
        _ => (),
      }
    }

    sendTask.abort();
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

    let res = match (request.entity.as_str(), request.action.as_str()) {
      // ==================== SPECIFIC HANDLERS WITH BROADCAST (todo/task/subtask) ====================

      ("todo", "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "getAll".to_string(),
            "todos".to_string(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      ("todo", "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "read".to_string(),
            "todos".to_string(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      ("todo", "create") => {
        if let Some(data) = request.data {
          let res = self
            .crudService
            .execute(
              "create".to_string(),
              "todos".to_string(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata),
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

      ("todo", "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crudService
            .execute(
              "update".to_string(),
              "todos".to_string(),
              Some(id.clone()),
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata),
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

      ("todo", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .crudService
            .execute(
              "delete".to_string(),
              "todos".to_string(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(syncMetadata),
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

      ("task", "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "getAll".to_string(),
            "tasks".to_string(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      ("task", "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "read".to_string(),
            "tasks".to_string(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      ("task", "create") => {
        if let Some(data) = request.data {
          let res = self
            .crudService
            .execute(
              "create".to_string(),
              "tasks".to_string(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata),
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

      ("task", "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crudService
            .execute(
              "update".to_string(),
              "tasks".to_string(),
              Some(id.clone()),
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata),
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

      ("task", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .crudService
            .execute(
              "delete".to_string(),
              "tasks".to_string(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(syncMetadata),
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

      ("subtask", "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "getAll".to_string(),
            "subtasks".to_string(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      ("subtask", "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "read".to_string(),
            "subtasks".to_string(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      ("subtask", "create") => {
        if let Some(data) = request.data {
          let res = self
            .crudService
            .execute(
              "create".to_string(),
              "subtasks".to_string(),
              None,
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata),
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

      ("subtask", "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          let res = self
            .crudService
            .execute(
              "update".to_string(),
              "subtasks".to_string(),
              Some(id.clone()),
              Some(data.clone()),
              None,
              None,
              Some(syncMetadata),
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

      ("subtask", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .crudService
            .execute(
              "delete".to_string(),
              "subtasks".to_string(),
              Some(id.clone()),
              None,
              None,
              None,
              Some(syncMetadata),
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

      // ==================== GENERIC HANDLERS (for all other entities) ====================
      // These handle: profiles, categories, users, daily_activities, and any future entities

      (_, "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "getAll".to_string(),
            request.entity.clone(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      (_, "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .crudService
          .execute(
            "read".to_string(),
            request.entity.clone(),
            None,
            None,
            Some(filter),
            None,
            Some(syncMetadata),
          )
          .await
          .unwrap_or_else(|e| e)
      }

      (_, "create") => {
        if let Some(data) = request.data {
          self
            .crudService
            .execute(
              "create".to_string(),
              request.entity.clone(),
              None,
              Some(data),
              None,
              None,
              Some(syncMetadata),
            )
            .await
            .unwrap_or_else(|e| e)
        } else {
          ResponseModel::from("Missing data for create action".to_string())
        }
      }

      (_, "update") => {
        if let (Some(id), Some(data)) = (request.id, request.data) {
          self
            .crudService
            .execute(
              "update".to_string(),
              request.entity.clone(),
              Some(id),
              Some(data),
              None,
              None,
              Some(syncMetadata),
            )
            .await
            .unwrap_or_else(|e| e)
        } else {
          ResponseModel::from("Missing id or data for update action".to_string())
        }
      }

      (_, "delete") => {
        if let Some(id) = request.id {
          self
            .crudService
            .execute(
              "delete".to_string(),
              request.entity.clone(),
              Some(id),
              None,
              None,
              None,
              Some(syncMetadata),
            )
            .await
            .unwrap_or_else(|e| e)
        } else {
          ResponseModel::from("Missing id for delete action".to_string())
        }
      }

      _ => ResponseModel::from(format!(
        "Unknown action or entity: {} on {}",
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
