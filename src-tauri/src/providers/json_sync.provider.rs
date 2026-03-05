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

  fn shouldUseMongo(&self, _nameTable: &str) -> bool {
    // Currently disabled - all data stored locally
    false
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
    nameTable: &str,
    filter: Option<Value>,
    id: &str,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    if self.shouldUseMongo(nameTable) {
      let mongoProvider = self.mongodbProvider.as_ref().unwrap();
      let mongoFilter = filter.as_ref().and_then(|f| self.convertValueToDoc(f).ok());
      let doc = mongoProvider.get(nameTable, mongoFilter, None, id).await?;
      self.convertDocToValue(doc)
    } else {
      Err(Box::new(std::io::Error::new(
        std::io::ErrorKind::Other,
        "MongoDB sync disabled",
      )))
    }
  }

  pub async fn getAllJsonOrMongo(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
    if self.shouldUseMongo(nameTable) {
      let mongoProvider = self.mongodbProvider.as_ref().unwrap();
      let mongoFilter = filter.as_ref().and_then(|f| self.convertValueToDoc(f).ok());
      let docs = mongoProvider.getAll(nameTable, mongoFilter, None).await?;
      docs
        .into_iter()
        .map(|doc| self.convertDocToValue(doc))
        .collect::<Result<Vec<_>, _>>()
    } else {
      Err(Box::new(std::io::Error::new(
        std::io::ErrorKind::Other,
        "MongoDB sync disabled",
      )))
    }
  }
}
