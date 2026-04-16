/* sys lib */
use std::sync::Arc;
use tokio::net::TcpListener;

/* services */
use crate::services::repository_service::RepositoryService;

/* websocket sub-modules */
use super::broadcast::BroadcastHelper;
use super::connection::ConnectionManager;
use super::handlers::CrudHandlers;

/// WebSocketServerService - Manages WebSocket server and client connections
pub struct WebSocketServerService {
  repository_service: Arc<RepositoryService>,
  clients: Arc<
    tokio::sync::Mutex<
      Vec<
        futures::channel::mpsc::UnboundedSender<tokio_tungstenite::tungstenite::protocol::Message>,
      >,
    >,
  >,
}

impl WebSocketServerService {
  pub fn new(repository_service: Arc<RepositoryService>) -> Self {
    Self {
      repository_service,
      clients: Arc::new(tokio::sync::Mutex::new(Vec::new())),
    }
  }

  /// Start WebSocket server on specified port
  pub async fn start(self: Arc<Self>, port: u16) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr)
      .await
      .expect("Failed to bind to address");

    let broadcast = BroadcastHelper::new(self.clients.clone());
    let crud_handlers = Arc::new(CrudHandlers::new(
      self.repository_service.clone(),
      broadcast,
    ));
    let connection_manager = Arc::new(ConnectionManager::new(crud_handlers, self.clients.clone()));

    while let Ok((stream, _)) = listener.accept().await {
      let manager_clone = connection_manager.clone();
      tauri::async_runtime::spawn(async move {
        manager_clone.handle_connection(stream).await;
      });
    }
  }
}
