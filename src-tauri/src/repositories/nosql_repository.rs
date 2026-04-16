use async_trait::async_trait;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;

#[async_trait]
pub trait EntityRepository: Send + Sync {
    async fn find_all(&self, collection: &str) -> Result<Vec<Value>, String>;
    async fn find_by_id(&self, collection: &str, id: &str) -> Result<Option<Value>, String>;
    async fn insert(&self, collection: &str, data: Value) -> Result<Value, String>;
    async fn update(&self, collection: &str, id: &str, data: Value) -> Result<Value, String>;
    async fn delete(&self, collection: &str, id: &str) -> Result<bool, String>;
}

pub struct JsonEntityRepository {
    provider: JsonProvider,
}

impl JsonEntityRepository {
    pub fn new(provider: JsonProvider) -> Self {
        Self { provider }
    }

    pub fn provider(&self) -> &JsonProvider {
        &self.provider
    }
}

#[async_trait]
impl EntityRepository for JsonEntityRepository {
    async fn find_all(&self, collection: &str) -> Result<Vec<Value>, String> {
        self.provider.find_all(collection).await.map_err(|e| e.to_string())
    }

    async fn find_by_id(&self, collection: &str, id: &str) -> Result<Option<Value>, String> {
        self.provider.find_by_id(collection, id).await.map_err(|e| e.to_string())
    }

    async fn insert(&self, collection: &str, data: Value) -> Result<Value, String> {
        self.provider.insert(collection, data).await.map_err(|e| e.to_string())
    }

    async fn update(&self, collection: &str, id: &str, data: Value) -> Result<Value, String> {
        self.provider.update(collection, id, data).await.map_err(|e| e.to_string())
    }

    async fn delete(&self, collection: &str, id: &str) -> Result<bool, String> {
        self.provider.delete(collection, id).await.map_err(|e| e.to_string())
    }
}

pub struct MongoEntityRepository {
    provider: MongoProvider,
}

impl MongoEntityRepository {
    pub fn new(provider: MongoProvider) -> Self {
        Self { provider }
    }

    pub fn provider(&self) -> &MongoProvider {
        &self.provider
    }
}

#[async_trait]
impl EntityRepository for MongoEntityRepository {
    async fn find_all(&self, collection: &str) -> Result<Vec<Value>, String> {
        self.provider.find_all(collection).await.map_err(|e| e.to_string())
    }

    async fn find_by_id(&self, collection: &str, id: &str) -> Result<Option<Value>, String> {
        self.provider.find_by_id(collection, id).await.map_err(|e| e.to_string())
    }

    async fn insert(&self, collection: &str, data: Value) -> Result<Value, String> {
        self.provider.insert(collection, data).await.map_err(|e| e.to_string())
    }

    async fn update(&self, collection: &str, id: &str, data: Value) -> Result<Value, String> {
        self.provider.update(collection, id, data).await.map_err(|e| e.to_string())
    }

    async fn delete(&self, collection: &str, id: &str) -> Result<bool, String> {
        self.provider.delete(collection, id).await.map_err(|e| e.to_string())
    }
}
