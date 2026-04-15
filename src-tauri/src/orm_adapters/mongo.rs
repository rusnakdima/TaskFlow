use async_trait::async_trait;
use nosql_orm::prelude::OrmResult;
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;

#[derive(Clone)]
pub struct TaskFlowMongoProvider {
  inner: nosql_orm::providers::MongoProvider,
}

impl TaskFlowMongoProvider {
  pub async fn new(uri: String, db_name: String) -> OrmResult<Self> {
    let inner = nosql_orm::providers::MongoProvider::connect(&uri, &db_name).await?;
    Ok(Self { inner })
  }

  pub fn inner(&self) -> &nosql_orm::providers::MongoProvider {
    &self.inner
  }
}

#[async_trait]
impl DatabaseProvider for TaskFlowMongoProvider {
  async fn insert(&self, collection: &str, doc: Value) -> OrmResult<Value> {
    self.inner.insert(collection, doc).await
  }

  async fn find_by_id(&self, collection: &str, id: &str) -> OrmResult<Option<Value>> {
    self.inner.find_by_id(collection, id).await
  }

  async fn find_many(
    &self,
    collection: &str,
    filter: Option<&nosql_orm::query::Filter>,
    skip: Option<u64>,
    limit: Option<u64>,
    sort_by: Option<&str>,
    sort_asc: bool,
  ) -> OrmResult<Vec<Value>> {
    self
      .inner
      .find_many(collection, filter, skip, limit, sort_by, sort_asc)
      .await
  }

  async fn update(&self, collection: &str, id: &str, doc: Value) -> OrmResult<Value> {
    self.inner.update(collection, id, doc).await
  }

  async fn patch(&self, collection: &str, id: &str, patch: Value) -> OrmResult<Value> {
    self.inner.patch(collection, id, patch).await
  }

  async fn delete(&self, collection: &str, id: &str) -> OrmResult<bool> {
    self.inner.delete(collection, id).await
  }

  async fn count(
    &self,
    collection: &str,
    filter: Option<&nosql_orm::query::Filter>,
  ) -> OrmResult<u64> {
    self.inner.count(collection, filter).await
  }
}
