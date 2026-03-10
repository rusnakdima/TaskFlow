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
    clientOptions.connect_timeout = Some(Duration::from_secs(3));
    clientOptions.server_selection_timeout = Some(Duration::from_secs(3));

    let client = Client::with_options(clientOptions)?;
    Ok(Self {
      mongoClient: Arc::new(client),
    })
  }

  pub fn getDatabase(&self, name: &str) -> mongodb::Database {
    self.mongoClient.database(name)
  }
}
