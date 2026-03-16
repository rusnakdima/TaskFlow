use crate::errors::ApiResult;
use mongodb::options::ClientOptions;
use mongodb::Client;
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
pub struct DbPool {
  pub mongoClient: Arc<Client>,
}

impl DbPool {
  pub async fn new(uri: &str) -> ApiResult<Self> {
    // Parse connection string with options
    let mut clientOptions = ClientOptions::parse(uri).await?;

    // ✅ Set timeouts - longer for initial connection, shorter for server selection
    // This allows connection to succeed while still failing reasonably fast when offline
    clientOptions.connect_timeout = Some(Duration::from_secs(10));
    clientOptions.server_selection_timeout = Some(Duration::from_secs(5));

    // Set pool configuration for better connection management
    clientOptions.max_pool_size = Some(50);
    clientOptions.min_pool_size = Some(1);
    clientOptions.max_idle_time = Some(Duration::from_secs(300));

    // Enable heartbeat for connection monitoring
    clientOptions.heartbeat_freq = Some(Duration::from_secs(10));

    // Create client
    let client = Client::with_options(clientOptions)?;

    Ok(Self {
      mongoClient: Arc::new(client),
    })
  }

  pub fn getDatabase(&self, name: &str) -> mongodb::Database {
    self.mongoClient.database(name)
  }
}
