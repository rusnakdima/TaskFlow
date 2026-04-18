/* sys lib */
use std::sync::Arc;
use std::collections::HashMap;

/* nosql_orm */
use nosql_orm::cdc::{Change, ChangeCapture};
use nosql_orm::error::OrmResult;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use chrono::Utc;

#[derive(Clone)]
pub struct CdcService {
    json_provider: JsonProvider,
    changes_cache: Arc<tokio::sync::RwLock<HashMap<String, Vec<Change>>>>,
}

impl CdcService {
    pub fn new(json_provider: JsonProvider) -> Self {
        Self {
            json_provider,
            changes_cache: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    async fn get_or_create_collection(
        &self,
        collection: &str,
    ) -> OrmResult<Vec<Change>> {
        let mut cache = self.changes_cache.write().await;
        if !cache.contains_key(collection) {
            // Try to load existing changes from JSON file
            match self.json_provider.find_all(collection).await {
                Ok(existing) => {
                    let changes: Vec<Change> = existing
                        .into_iter()
                        .filter_map(|v| serde_json::from_value(v).ok())
                        .collect();
                    cache.insert(collection.to_string(), changes);
                }
                Err(_) => {
                    cache.insert(collection.to_string(), Vec::new());
                }
            }
        }
        Ok(cache.get(collection).cloned().unwrap_or_default())
    }

    async fn save_changes(&self, collection: &str, changes: &[Change]) -> OrmResult<()> {
        let mut cache = self.changes_cache.write().await;
        let values: Vec<_> = changes
            .iter()
            .filter_map(|c| serde_json::to_value(c).ok())
            .collect();

        if values.is_empty() {
            return Ok(());
        }

        // Delete existing changes for this collection (using find_all + delete)
        let existing = self.json_provider.find_all(collection).await.unwrap_or_default();
        for existing_change in existing {
            if let Some(id) = existing_change.get("id").and_then(|v| v.as_str()) {
                let _ = self.json_provider.delete(collection, id).await;
            }
        }

        // Insert all changes
        for value in &values {
            let _ = self.json_provider.insert(collection, value.clone()).await;
        }

        cache.insert(collection.to_string(), changes.to_vec());
        Ok(())
    }
}

#[async_trait::async_trait]
impl ChangeCapture for CdcService {
    async fn capture(&self, change: Change) -> OrmResult<()> {
        let collection = change.collection.as_str();
        let mut changes = self.get_or_create_collection(collection).await?;

        changes.push(change.clone());

        // Keep only last 1000 changes per collection
        if changes.len() > 1000 {
            changes = changes.split_off(changes.len() - 1000);
        }

        self.save_changes(collection, &changes).await?;

        Ok(())
    }

    async fn get_changes(
        &self,
        collection: &str,
        since: chrono::DateTime<Utc>,
    ) -> OrmResult<Vec<Change>> {
        let changes = self.get_or_create_collection(collection).await?;

        Ok(changes
            .into_iter()
            .filter(|c| c.timestamp >= since)
            .collect())
    }

    async fn get_entity_history(
        &self,
        collection: &str,
        entity_id: &str,
    ) -> OrmResult<Vec<Change>> {
        let changes = self.get_or_create_collection(collection).await?;

        Ok(changes
            .into_iter()
            .filter(|c| c.entity_id == entity_id)
            .collect())
    }
}
