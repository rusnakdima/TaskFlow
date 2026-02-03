/* sys lib */
use futures_util::{SinkExt, StreamExt};
use serde_json::{from_str, json, to_string, Value};
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};

/* services */
use crate::services::{
  subtask_service::SubtaskService, task_service::TaskService, todo_service::TodoService,
};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  subtask_model::{SubtaskCreateModel, SubtaskUpdateModel},
  sync_metadata_model::SyncMetadata,
  task_model::{TaskCreateModel, TaskUpdateModel},
  todo_model::{TodoCreateModel, TodoModel, TodoUpdateModel},
  websocket_model::{WsBroadcast, WsRequest, WsResponse},
};

type Clients = Arc<Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>;

#[allow(non_snake_case)]
pub struct WebSocketServerService {
  pub todoService: Arc<TodoService>,
  pub taskService: Arc<TaskService>,
  pub subtaskService: Arc<SubtaskService>,
  clients: Clients,
}

#[allow(non_snake_case)]
impl WebSocketServerService {
  #[allow(non_snake_case)]
  pub fn new(
    todoService: Arc<TodoService>,
    taskService: Arc<TaskService>,
    subtaskService: Arc<SubtaskService>,
  ) -> Self {
    Self {
      todoService,
      taskService,
      subtaskService,
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
        )
      }
    };

    let requestId = request.requestId.clone();

    let syncMetadata = request.syncMetadata.unwrap_or(SyncMetadata {
      isOwner: true,
      isPrivate: false,
    });

    let res = match (request.entity.as_str(), request.action.as_str()) {
      ("todo", "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        let result = self.todoService.getAll(filter, syncMetadata).await;

        result.unwrap_or_else(|e| e)
      }
      ("todo", "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .todoService
          .get(filter, syncMetadata)
          .await
          .unwrap_or_else(|e| e)
      }
      ("todo", "create") => {
        if let Some(data) = request.data {
          let createModel: TodoCreateModel = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .todoService
            .create(createModel, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the created todo data (with ID) instead of request data
            match &res.data {
              DataValue::Object(createdTodo) => {
                self.broadcast("todo-created", "todo", createdTodo.clone());
              }
              _ => {
                self.broadcast("todo-created", "todo", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing data for create action".to_string())
        }
      }
      ("todo", "update") => {
        if let (Some(id), Some(mut data)) = (request.id, request.data) {
          data["id"] = json!(id);
          data["updatedAt"] = json!(chrono::Utc::now().to_rfc3339());
          let updateModel: TodoUpdateModel = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .todoService
            .update(id, updateModel, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the updated todo data instead of request data
            match &res.data {
              DataValue::Object(updatedTodo) => {
                self.broadcast("todo-updated", "todo", updatedTodo.clone());
              }
              _ => {
                self.broadcast("todo-updated", "todo", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing id or data for update action".to_string())
        }
      }
      ("todo", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .todoService
            .delete(id.clone(), syncMetadata)
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
      ("todo", "update-all") => {
        if let Some(data) = request.data {
          let models: Vec<TodoModel> = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .todoService
            .updateAll(models, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the updated todos data if available, otherwise use request data
            match &res.data {
              DataValue::Array(updatedTodos) => {
                self.broadcast("todo-updated-all", "todo", json!(updatedTodos));
              }
              DataValue::Object(updatedTodos) => {
                self.broadcast("todo-updated-all", "todo", updatedTodos.clone());
              }
              _ => {
                self.broadcast("todo-updated-all", "todo", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing data".to_string())
        }
      }
      ("task", "get-all") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .taskService
          .getAll(filter, syncMetadata)
          .await
          .unwrap_or_else(|e| e)
      }
      ("task", "get") => {
        let filter = request.filter.unwrap_or(json!({}));
        self
          .taskService
          .get(filter, syncMetadata)
          .await
          .unwrap_or_else(|e| e)
      }
      ("task", "create") => {
        if let Some(data) = request.data {
          let createModel: TaskCreateModel = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .taskService
            .create(createModel, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the created task data (with ID) instead of request data
            match &res.data {
              DataValue::Object(createdTask) => {
                self.broadcast("task-created", "task", createdTask.clone());
              }
              _ => {
                self.broadcast("task-created", "task", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing data".to_string())
        }
      }
      ("task", "update") => {
        if let (Some(id), Some(mut data)) = (request.id, request.data) {
          data["id"] = json!(id);
          data["updatedAt"] = json!(chrono::Utc::now().to_rfc3339());
          let updateModel: TaskUpdateModel = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .taskService
            .update(id, updateModel, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the updated task data instead of request data
            match &res.data {
              DataValue::Object(updatedTask) => {
                self.broadcast("task-updated", "task", updatedTask.clone());
              }
              _ => {
                self.broadcast("task-updated", "task", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing id for update action".to_string())
        }
      }
      ("task", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .taskService
            .delete(id.clone(), syncMetadata)
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
          .subtaskService
          .getAll(filter, syncMetadata)
          .await
          .unwrap_or_else(|e| e)
      }
      ("subtask", "create") => {
        if let Some(data) = request.data {
          let createModel: SubtaskCreateModel = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .subtaskService
            .create(createModel, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the created subtask data (with ID) instead of request data
            match &res.data {
              DataValue::Object(createdSubtask) => {
                self.broadcast("subtask-created", "subtask", createdSubtask.clone());
              }
              _ => {
                self.broadcast("subtask-created", "subtask", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing data".to_string())
        }
      }
      ("subtask", "update") => {
        if let (Some(id), Some(mut data)) = (request.id, request.data) {
          data["id"] = json!(id);
          data["updatedAt"] = json!(chrono::Utc::now().to_rfc3339());
          let updateModel: SubtaskUpdateModel = match serde_json::from_value(data.clone()) {
            Ok(m) => m,
            Err(e) => {
              return (
                ResponseModel::from(format!("Invalid data format: {}", e)),
                requestId,
              )
            }
          };
          let res = self
            .subtaskService
            .update(id, updateModel, syncMetadata)
            .await
            .unwrap_or_else(|e| e);
          if res.status == ResponseStatus::Success {
            // Broadcast the updated subtask data instead of request data
            match &res.data {
              DataValue::Object(updatedSubtask) => {
                self.broadcast("subtask-updated", "subtask", updatedSubtask.clone());
              }
              _ => {
                self.broadcast("subtask-updated", "subtask", data);
              }
            }
          }
          res
        } else {
          ResponseModel::from("Missing id or data".to_string())
        }
      }
      ("subtask", "delete") => {
        if let Some(id) = request.id {
          let res = self
            .subtaskService
            .delete(id.clone(), syncMetadata)
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
