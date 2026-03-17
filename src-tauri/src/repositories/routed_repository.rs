/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::json::json_provider::JsonProvider;
use crate::providers::mongodb::mongodb_provider::MongodbProvider;

/* models */
use crate::models::sync_metadata_model::SyncMetadata;

/* helpers */
use crate::helpers::common::getProviderType;

/// RoutedRepository - Routes CRUD operations to JSON or MongoDB based on SyncMetadata
/// - Private + Owner = JSON provider (local storage)
/// - Team (!Private) OR !Owner = MongoDB provider (cloud storage)
///
/// OFFLINE-FIRST: Auto-fallback to JSON provider when MongoDB is unavailable
pub struct RoutedRepository {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub tableName: String,
  pub mongoHealthy: Arc<std::sync::atomic::AtomicBool>,
}

impl RoutedRepository {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    tableName: String,
  ) -> Self {
    // Initialize MongoDB health status
    let mongo_healthy = mongodbProvider.is_some();

    Self {
      jsonProvider,
      mongodbProvider,
      tableName,
      mongoHealthy: Arc::new(std::sync::atomic::AtomicBool::new(mongo_healthy)),
    }
  }

  /// Create a scoped repository for a specific table, sharing the same health-tracking AtomicBool.
  /// This preserves MongoDB health state across calls instead of resetting it each time.
  pub fn for_table(&self, tableName: String) -> Self {
    Self {
      jsonProvider: self.jsonProvider.clone(),
      mongodbProvider: self.mongodbProvider.clone(),
      tableName,
      mongoHealthy: Arc::clone(&self.mongoHealthy),
    }
  }

  fn get_mongo(&self) -> Result<&Arc<MongodbProvider>, String> {
    self
      .mongodbProvider
      .as_ref()
      .ok_or_else(|| "MongoDB provider not available".to_string())
  }

  /// Check if MongoDB connection is healthy
  fn isMongoHealthy(&self) -> bool {
    self.mongodbProvider.is_some() && self.mongoHealthy.load(std::sync::atomic::Ordering::Relaxed)
  }

  /// Mark MongoDB as unhealthy
  fn markMongoUnhealthy(&self) {
    self
      .mongoHealthy
      .swap(false, std::sync::atomic::Ordering::Relaxed);
  }

  /// Mark MongoDB as healthy
  fn markMongoHealthy(&self) {
    self
      .mongoHealthy
      .swap(true, std::sync::atomic::Ordering::Relaxed);
  }

  /// Determine which provider to use based on syncMetadata and connection health
  fn useJsonProvider(&self, syncMetadata: Option<&SyncMetadata>) -> bool {
    // If no MongoDB provider, always use JSON
    if self.mongodbProvider.is_none() {
      return true;
    }

    // If MongoDB is unhealthy, fallback to JSON (unless explicitly requesting MongoDB)
    if !self.isMongoHealthy() {
      return true;
    }

    // Use syncMetadata to determine provider
    if let Some(metadata) = syncMetadata {
      match getProviderType(metadata) {
        Ok(provider_type) => match provider_type {
          crate::models::provider_type_model::ProviderType::Json => true,
          crate::models::provider_type_model::ProviderType::Mongo => !self.isMongoHealthy(),
        },
        Err(_) => true, // Default to JSON on error
      }
    } else {
      true // Default to JSON if no syncMetadata provided
    }
  }

  pub async fn getAll(
    &self,
    filter: Option<Value>,
    syncMetadata: Option<&SyncMetadata>,
  ) -> Result<Vec<Value>, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .getAll(&self.tableName, filter)
        .await
        .map_err(|e| e.to_string())
    } else {
      let mongoProvider = self.get_mongo()?;

      match mongoProvider
        .mongodbCrud
        .getAll(&self.tableName, filter.clone())
        .await
      {
        Ok(data) => {
          // Success - mark MongoDB as healthy
          self.markMongoHealthy();
          Ok(data)
        }
        Err(_e) => {
          self.markMongoUnhealthy();
          self
            .jsonProvider
            .jsonCrud
            .getAll(&self.tableName, filter)
            .await
            .map_err(|e| e.to_string())
        }
      }
    }
  }

  pub async fn get(&self, id: &str, syncMetadata: Option<&SyncMetadata>) -> Result<Value, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .get(&self.tableName, id)
        .await
        .map_err(|e| e.to_string())
    } else {
      let mongoProvider = self.get_mongo()?;

      match mongoProvider.mongodbCrud.get(&self.tableName, id).await {
        Ok(data) => {
          self.markMongoHealthy();
          Ok(data)
        }
        Err(_e) => {
          self.markMongoUnhealthy();
          self
            .jsonProvider
            .jsonCrud
            .get(&self.tableName, id)
            .await
            .map_err(|e| e.to_string())
        }
      }
    }
  }

  pub async fn create(
    &self,
    data: Value,
    syncMetadata: Option<&SyncMetadata>,
  ) -> Result<Value, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .create(&self.tableName, data)
        .await
        .map_err(|e| e.to_string())
    } else {
      self
        .get_mongo()?
        .mongodbCrud
        .create(&self.tableName, data)
        .await
        .map_err(|e| e.to_string())
    }
  }

  pub async fn update(
    &self,
    id: &str,
    data: Value,
    syncMetadata: Option<&SyncMetadata>,
  ) -> Result<Value, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .update(&self.tableName, id, data)
        .await
        .map_err(|e| e.to_string())
    } else {
      self
        .get_mongo()?
        .mongodbCrud
        .update(&self.tableName, id, data)
        .await
        .map_err(|e| e.to_string())
    }
  }

  pub async fn delete(
    &self,
    id: &str,
    syncMetadata: Option<&SyncMetadata>,
  ) -> Result<bool, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .delete(&self.tableName, id)
        .await
        .map_err(|e| e.to_string())
    } else {
      self
        .get_mongo()?
        .mongodbCrud
        .delete(&self.tableName, id)
        .await
        .map_err(|e| e.to_string())
    }
  }

  pub async fn hardDelete(
    &self,
    id: &str,
    syncMetadata: Option<&SyncMetadata>,
  ) -> Result<bool, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .hardDelete(&self.tableName, id)
        .await
        .map_err(|e| e.to_string())
    } else {
      self
        .get_mongo()?
        .hardDelete(&self.tableName, id)
        .await
        .map_err(|e| e.to_string())
    }
  }

  pub async fn updateAll(
    &self,
    records: Vec<Value>,
    syncMetadata: Option<&SyncMetadata>,
  ) -> Result<bool, String> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .updateAll(&self.tableName, records)
        .await
        .map_err(|e| e.to_string())
    } else {
      self
        .get_mongo()?
        .mongodbCrud
        .updateAll(&self.tableName, records)
        .await
        .map_err(|e| e.to_string())
    }
  }
}
