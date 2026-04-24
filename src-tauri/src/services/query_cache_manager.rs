use nosql_orm::cache::QueryCache;
use serde_json::Value;
use std::sync::Arc;

pub struct QueryCacheManager {
  cache: Option<Arc<QueryCache>>,
}

impl QueryCacheManager {
  pub fn new(cache: Option<Arc<QueryCache>>) -> Self {
    Self { cache }
  }

  pub fn cache_key(&self, table: &str, filter: Option<&str>, _relations: Option<&str>, _sort: Option<&str>, _skip: Option<&str>) -> Option<String> {
    self.cache.as_ref().map(|cache| {
      cache.cache_key(table, filter, None, None, None)
    })
  }

  pub async fn get_cached<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
    if let Some(ref cache) = self.cache {
      cache.get::<T>(key).await.ok().flatten()
    } else {
      None
    }
  }

  pub async fn set_cached(&self, key: String, docs: &Vec<Value>) -> bool {
    if let Some(ref cache) = self.cache {
      if !docs.is_empty() {
        cache.set(key, docs).await.is_ok()
      } else {
        false
      }
    } else {
      false
    }
  }

  pub fn has_cache(&self) -> bool {
    self.cache.is_some()
  }
}
