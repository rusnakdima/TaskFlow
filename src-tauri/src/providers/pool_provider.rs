/* sys lib */
use std::path::Path;
use std::sync::Arc;

/* nosql_orm */
use nosql_orm::error::OrmResult;
use nosql_orm::pool::pool::{JsonPool, PoolConfig, Pooled};
use nosql_orm::provider::DatabaseProvider;

#[derive(Clone)]
pub struct PooledJsonProvider {
    pool: Arc<JsonPool>,
}

impl PooledJsonProvider {
    pub async fn new(base_dir: impl AsRef<Path>) -> OrmResult<Self> {
        let config = PoolConfig::new(10); // max 10 concurrent connections
        let pool = JsonPool::with_config(base_dir.as_ref().to_path_buf(), config).await?;
        Ok(Self {
            pool: Arc::new(pool),
        })
    }

    pub async fn acquire(&self) -> OrmResult<PooledJsonHandle> {
        let pooled = self.pool.acquire(true).await?;
        Ok(PooledJsonHandle {
            inner: pooled,
            _pool_ref: self.pool.clone(),
        })
    }
}

pub struct PooledJsonHandle {
    inner: PooledJson,
    _pool_ref: Arc<JsonPool>,
}

impl PooledJsonHandle {
    pub async fn insert(&self, collection: &str, doc: serde_json::Value) -> OrmResult<serde_json::Value> {
        self.inner.insert(collection, doc).await
    }

    pub async fn find_by_id(&self, collection: &str, id: &str) -> OrmResult<Option<serde_json::Value>> {
        self.inner.find_by_id(collection, id).await
    }

    pub async fn find_many(
        &self,
        collection: &str,
        filter: Option<&nosql_orm::query::Filter>,
        skip: Option<u64>,
        limit: Option<u64>,
        sort_by: Option<&str>,
        sort_asc: bool,
    ) -> OrmResult<Vec<serde_json::Value>> {
        self.inner.find_many(collection, filter, skip, limit, sort_by, sort_asc).await
    }

    pub async fn find_all(&self, collection: &str) -> OrmResult<Vec<serde_json::Value>> {
        self.inner.find_all(collection).await
    }

    pub async fn update(&self, collection: &str, id: &str, doc: serde_json::Value) -> OrmResult<serde_json::Value> {
        self.inner.update(collection, id, doc).await
    }

    pub async fn patch(&self, collection: &str, id: &str, patch: serde_json::Value) -> OrmResult<serde_json::Value> {
        self.inner.patch(collection, id, patch).await
    }

    pub async fn delete(&self, collection: &str, id: &str) -> OrmResult<bool> {
        self.inner.delete(collection, id).await
    }

    pub async fn count(&self, collection: &str, filter: Option<&nosql_orm::query::Filter>) -> OrmResult<u64> {
        self.inner.count(collection, filter).await
    }
}

// Need to import PooledJson from the pool module
use nosql_orm::pool::pool::PooledJson;
