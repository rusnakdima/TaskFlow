use async_trait::async_trait;
use nosql_orm::prelude::OrmResult;
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct TaskFlowJsonProvider {
  inner: nosql_orm::providers::JsonProvider,
  app_handle: AppHandle,
}

impl TaskFlowJsonProvider {
  pub async fn new(app_handle: AppHandle, home_folder: String, db_name: String) -> Self {
    let document_dir = app_handle.path().document_dir().unwrap();
    let db_path = document_dir.join(&home_folder).join(&db_name);

    let inner = nosql_orm::providers::JsonProvider::new(db_path)
      .await
      .expect("Failed to create nosql_orm JsonProvider");

    Self { inner, app_handle }
  }

  pub fn app_handle(&self) -> &AppHandle {
    &self.app_handle
  }

  pub fn inner(&self) -> &nosql_orm::providers::JsonProvider {
    &self.inner
  }
}

#[async_trait]
impl DatabaseProvider for TaskFlowJsonProvider {
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
