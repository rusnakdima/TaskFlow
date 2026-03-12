use crate::errors::ApiResult;
use async_trait::async_trait;
use serde_json::Value;

#[async_trait]
#[allow(dead_code)]
pub trait CrudProvider: Send + Sync {
  async fn getAll(&self, table: &str, filter: Option<Value>) -> ApiResult<Vec<Value>>;
  async fn get(&self, table: &str, id: &str) -> ApiResult<Value>;
  async fn create(&self, table: &str, data: Value) -> ApiResult<Value>;
  async fn update(&self, table: &str, id: &str, data: Value) -> ApiResult<Value>;
  async fn delete(&self, table: &str, id: &str) -> ApiResult<bool>;
}
