/* sys lib */
use mongodb::bson::{to_bson, Bson, Document};
use serde_json::{to_value, Value};
use std::sync::Arc;

/* helpers */
use super::mongodb_provider::MongodbProvider;

/// JsonSyncProvider - Sync operations between JSON and MongoDB
#[derive(Clone)]
pub struct JsonSyncProvider {
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl JsonSyncProvider {
  pub fn new(mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self { mongodbProvider }
  }

  fn convertDocToValue(
    &self,
    doc: Document,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    Ok(to_value(doc)?)
  }

  fn convertValueToDoc(
    &self,
    value: &Value,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    let bsonValue = to_bson(value)?;
    if let Bson::Document(doc) = bsonValue {
      Ok(doc)
    } else {
      Err(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "Expected Document",
      )))
    }
  }

  pub async fn getByFieldJsonOrMongo(
    &self,
    _nameTable: &str,
    _filter: Option<Value>,
    _id: &str,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    // MongoDB sync disabled
    Err(Box::new(std::io::Error::new(
      std::io::ErrorKind::Other,
      "MongoDB sync disabled",
    )))
  }

  pub async fn getAllJsonOrMongo(
    &self,
    _nameTable: &str,
    _filter: Option<Value>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    // MongoDB sync disabled
    Err(Box::new(std::io::Error::new(
      std::io::ErrorKind::Other,
      "MongoDB sync disabled",
    )))
  }
}
