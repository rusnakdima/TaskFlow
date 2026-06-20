use nosql_orm::cache::QueryCache;
use std::sync::Arc;
pub struct CacheService {
  pub query_cache: Option<Arc<QueryCache>>,
}
impl CacheService {
  pub fn new() -> Self {
    Self { query_cache: None }
  }
  pub fn with_cache(mut self, cache: QueryCache) -> Self {
    self.query_cache = Some(Arc::new(cache));
    self
  }
  pub async fn invalidate_collection(&self, table: &str) {
    if let Some(ref cache) = self.query_cache {
      let _ = cache.invalidate_collection(table).await;
    }
  }
  pub fn cache_key(table: &str, filter_json: Option<&str>, load: Option<&str>) -> String {
    let filter_part = filter_json.unwrap_or("{}");
    let load_part = load.unwrap_or("");
    format!("{}:{}:{}", table, filter_part, load_part)
  }
}
impl Default for CacheService {
  fn default() -> Self {
    Self::new()
  }
}
