/* sys lib */
use std::sync::Arc;

/* providers */
use crate::providers::mongodb::mongodb_provider::MongodbProvider;

/// JsonSyncProvider - MongoDB sync configuration for JSON provider
/// 
/// Note: Actual sync operations are handled by `MongodbSyncProvider` in the mongodb module.
/// This struct exists to hold the optional MongoDB provider reference.
#[derive(Clone)]
pub struct JsonSyncProvider {
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl JsonSyncProvider {
  pub fn new(mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self { mongodbProvider }
  }
}
