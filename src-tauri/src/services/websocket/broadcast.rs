/* sys lib */
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::protocol::Message;

/* models */
use crate::entities::websocket_entity::WsBroadcast;

/// WebSocket broadcast helper - sends events to all connected clients
///
/// Uses `tokio::sync::Mutex` (async-aware) instead of `std::sync::Mutex`
/// to avoid blocking the Tokio runtime and to prevent poison panics (H-12).
pub struct BroadcastHelper {
  clients: Arc<Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>,
}

impl BroadcastHelper {
  pub fn new(clients: Arc<Mutex<Vec<futures::channel::mpsc::UnboundedSender<Message>>>>) -> Self {
    Self { clients }
  }

  /// Broadcast an event to all connected clients
  pub async fn broadcast(&self, event: &str, entity: &str, data: Value) {
    let broadcast = WsBroadcast {
      event: event.to_string(),
      entity: entity.to_string(),
      data,
    };
    let json = serde_json::to_string(&broadcast).unwrap_or_default();
    let msg = Message::Text(json.into());

    let mut clients = self.clients.lock().await;
    clients.retain(|client| client.unbounded_send(msg.clone()).is_ok());
  }

  /// Get entity name for broadcast (singular form)
  pub fn get_broadcast_name(entity: &str) -> String {
    match entity {
      "todos" => "todo".to_string(),
      "tasks" => "task".to_string(),
      "subtasks" => "subtask".to_string(),
      "chats" => "chat".to_string(),
      "comments" => "comment".to_string(),
      s => s.to_string(),
    }
  }

  /// Broadcast entity created event
  pub async fn broadcast_created(&self, entity: &str, data: Value) {
    let broadcast_entity = Self::get_broadcast_name(entity);
    self
      .broadcast(
        &format!("{}-created", broadcast_entity),
        &broadcast_entity,
        data,
      )
      .await;
  }

  /// Broadcast entity updated event
  pub async fn broadcast_updated(&self, entity: &str, data: Value) {
    let broadcast_entity = Self::get_broadcast_name(entity);
    self
      .broadcast(
        &format!("{}-updated", broadcast_entity),
        &broadcast_entity,
        data,
      )
      .await;
  }

  /// Broadcast entity deleted event
  pub async fn broadcast_deleted(&self, entity: &str, data: Value) {
    let broadcast_entity = Self::get_broadcast_name(entity);
    self
      .broadcast(
        &format!("{}-deleted", broadcast_entity),
        &broadcast_entity,
        data,
      )
      .await;
  }

  /// Broadcast entity restored event (M-8)
  pub async fn broadcast_restored(&self, entity: &str, data: Value) {
    let broadcast_entity = Self::get_broadcast_name(entity);
    self
      .broadcast(
        &format!("{}-restored", broadcast_entity),
        &broadcast_entity,
        data,
      )
      .await;
  }

  /// Broadcast chat cleared event (special case)
  pub async fn broadcast_chat_cleared(&self, todo_id: &str) {
    self
      .broadcast(
        "chat-cleared",
        "chat",
        serde_json::json!({ "todoId": todo_id }),
      )
      .await;
  }
}
