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
    let mut clientOptions = ClientOptions::parse(uri).await?;
    
    // Increased timeouts for more reliable connections
    // 3 seconds was too aggressive for networks with latency
    clientOptions.connect_timeout = Some(Duration::from_secs(10));
    clientOptions.server_selection_timeout = Some(Duration::from_secs(10));
    
    // Set max pool size for better connection management
    clientOptions.max_pool_size = Some(50);
    clientOptions.min_pool_size = Some(1);
    clientOptions.max_idle_time = Some(Duration::from_secs(300));

    let client = Client::with_options(clientOptions)?;
    Ok(Self {
      mongoClient: Arc::new(client),
    })
  }

  pub fn getDatabase(&self, name: &str) -> mongodb::Database {
    self.mongoClient.database(name)
  }
}
