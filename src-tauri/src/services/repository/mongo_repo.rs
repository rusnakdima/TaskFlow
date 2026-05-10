use nosql_orm::cache::QueryCache;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;
use serde_json::Value;
use std::sync::Arc;

use crate::entities::response_entity::ResponseModel;
use crate::helpers::{response_helper::err_response, security_helper::security_projection};
use crate::providers::mongodb_provider::MongoProvider;

pub struct MongoRepoService {
  pub provider: Option<Arc<MongoProvider>>,
  pub query_cache: Option<Arc<QueryCache>>,
}

impl MongoRepoService {
  pub fn new(provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      provider,
      query_cache: None,
    }
  }

  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    self.query_cache = Some(Arc::new(cache));
    self
  }

  pub fn is_available(&self) -> bool {
    self.provider.is_some()
  }

  pub async fn find_many(
    &self,
    table: &str,
    filter: Option<&Filter>,
  ) -> Result<Vec<Value>, ResponseModel> {
    let provider = self
      .provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    provider
      .find_many(table, filter, None, None, None, true)
      .await
      .map_err(|e| err_response(&e.to_string()))
  }

  pub async fn find_by_id(&self, table: &str, id: &str) -> Result<Option<Value>, ResponseModel> {
    let provider = self
      .provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    provider
      .find_by_id(table, id)
      .await
      .map_err(|e| err_response(&e.to_string()))
  }

  pub async fn insert(&self, table: &str, data: Value) -> Result<Value, ResponseModel> {
    let provider = self
      .provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    provider
      .insert(table, data)
      .await
      .map_err(|e| err_response(&e.to_string()))
  }

  pub async fn update(&self, table: &str, id: &str, data: Value) -> Result<Value, ResponseModel> {
    let provider = self
      .provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    provider
      .update(table, id, data)
      .await
      .map_err(|e| err_response(&e.to_string()))
  }

  pub async fn delete(&self, table: &str, id: &str) -> Result<(), ResponseModel> {
    let provider = self
      .provider
      .as_ref()
      .ok_or_else(|| err_response("MongoDB not available"))?;
    provider
      .delete(table, id)
      .await
      .map_err(|e| err_response(&e.to_string()))
      .map(|_| ())
  }

  pub async fn invalidate_cache(&self, table: &str) {
    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(table).await;
    }
  }

  pub fn apply_projection(&self, docs: Vec<Value>) -> Vec<Value> {
    let projection = security_projection();
    docs
      .into_iter()
      .map(|doc| projection.apply_recursive(&doc))
      .collect()
  }

  pub fn add_collection_metadata(&self, mut docs: Vec<Value>, collection: &str) -> Vec<Value> {
    for doc in &mut docs {
      if let Some(obj) = doc.as_object_mut() {
        if !obj.contains_key("_collection") {
          obj.insert(
            "_collection".to_string(),
            Value::String(collection.to_string()),
          );
        }
      }
    }
    docs
  }

  pub fn parse_load_param(load: Option<String>) -> Vec<String> {
    match load {
      Some(l) => {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(&l) {
          return arr;
        }
        l.split(',').map(|s| s.trim().to_string()).collect()
      }
      None => vec![],
    }
  }
}
