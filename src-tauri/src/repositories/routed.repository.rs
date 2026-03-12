/* sys lib */
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::json::json_provider::JsonProvider;
use crate::providers::mongodb::mongodb_provider::MongodbProvider;

/* models */
use crate::models::sync_metadata_model::SyncMetadata;

/* errors */
use crate::errors::ApiResult;

/* helpers */
use crate::helpers::common::getProviderType;

/// RoutedRepository - Routes CRUD operations to JSON or MongoDB based on SyncMetadata
/// - Private + Owner = JSON provider (local storage)
/// - Team (!Private) OR !Owner = MongoDB provider (cloud storage)
pub struct RoutedRepository {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub tableName: String,
}

impl RoutedRepository {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    tableName: String,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tableName,
    }
  }

  /// Determine which provider to use based on syncMetadata
  fn useJsonProvider(&self, syncMetadata: Option<&SyncMetadata>) -> bool {
    if let Some(metadata) = syncMetadata {
      match getProviderType(metadata) {
        Ok(provider_type) => match provider_type {
          crate::models::provider_type_model::ProviderType::Json => true,
          crate::models::provider_type_model::ProviderType::Mongo => false,
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
  ) -> ApiResult<Vec<Value>> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .getAll(&self.tableName, filter)
        .await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider
        .mongodbCrud
        .getAll(&self.tableName, filter)
        .await
    }
  }

  pub async fn get(&self, id: &str, syncMetadata: Option<&SyncMetadata>) -> ApiResult<Value> {
    if self.useJsonProvider(syncMetadata) {
      self.jsonProvider.jsonCrud.get(&self.tableName, id).await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider.mongodbCrud.get(&self.tableName, id).await
    }
  }

  pub async fn create(&self, data: Value, syncMetadata: Option<&SyncMetadata>) -> ApiResult<bool> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .create(&self.tableName, data)
        .await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider
        .mongodbCrud
        .create(&self.tableName, data)
        .await
    }
  }

  pub async fn update(
    &self,
    id: &str,
    data: Value,
    syncMetadata: Option<&SyncMetadata>,
  ) -> ApiResult<bool> {
    if self.useJsonProvider(syncMetadata) {
      self
        .jsonProvider
        .jsonCrud
        .update(&self.tableName, id, data)
        .await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider
        .mongodbCrud
        .update(&self.tableName, id, data)
        .await
    }
  }

  pub async fn delete(&self, id: &str, syncMetadata: Option<&SyncMetadata>) -> ApiResult<bool> {
    if self.useJsonProvider(syncMetadata) {
      self.jsonProvider.jsonCrud.delete(&self.tableName, id).await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider.mongodbCrud.delete(&self.tableName, id).await
    }
  }

  pub async fn hardDelete(&self, id: &str, syncMetadata: Option<&SyncMetadata>) -> ApiResult<bool> {
    if self.useJsonProvider(syncMetadata) {
      self.jsonProvider.hardDelete(&self.tableName, id).await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider.hardDelete(&self.tableName, id).await
    }
  }

  pub async fn updateAll(
    &self,
    records: Vec<Value>,
    syncMetadata: Option<&SyncMetadata>,
  ) -> ApiResult<bool> {
    if self.useJsonProvider(syncMetadata) {
      self.jsonProvider.updateAll(&self.tableName, records).await
    } else {
      let mongoProvider = self
        .mongodbProvider
        .as_ref()
        .ok_or("MongoDB provider not available")?;
      mongoProvider
        .mongodbCrud
        .updateAll(&self.tableName, records)
        .await
    }
  }
}
