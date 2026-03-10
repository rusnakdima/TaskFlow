/* sys lib */
use mongodb::{bson::Document, options::ClientOptions, Client, Collection};
use std::time::Duration;

/* models */
use crate::models::relation_obj::RelationObj;

/* providers */
use super::{
  json_provider::JsonProvider, mongodb_crud_provider::MongodbCrudProvider,
  mongodb_relations_provider::MongodbRelationsProvider, mongodb_sync_provider::MongodbSyncProvider,
};

#[derive(Clone)]
pub struct MongodbProvider {
  pub mongodbCrud: MongodbCrudProvider,
  pub mongodbRelations: MongodbRelationsProvider,
  pub mongodbSync: MongodbSyncProvider,
}

impl MongodbProvider {
  pub async fn new(
    envUri: String,
    envDbName: String,
  ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
    let uri = envUri;
    let mut clientOptions = ClientOptions::parse(uri).await?;
    clientOptions.app_name = Some(envDbName.clone().to_string());
    clientOptions.connect_timeout = Some(Duration::from_secs(3));
    clientOptions.server_selection_timeout = Some(Duration::from_secs(3));
    let client = Client::with_options(clientOptions)?;
    let db = client.database(&envDbName);

    let mongodbCrud = MongodbCrudProvider::new(db.clone());
    let mongodbRelations = MongodbRelationsProvider::new(mongodbCrud.clone());
    let mongodbSync = MongodbSyncProvider::new(mongodbCrud.clone());

    Ok(Self {
      mongodbCrud,
      mongodbRelations,
      mongodbSync,
    })
  }

  // ==================== CRUD OPERATIONS ====================

  pub async fn getDataTable(
    &self,
    nameTable: &str,
  ) -> Result<Collection<Document>, Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbCrud.getDataTable(nameTable).await
  }

  pub async fn getAll(
    &self,
    nameTable: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Document>, Box<dyn std::error::Error + Send + Sync>> {
    let mut results = self.mongodbCrud.getAll(nameTable, filter).await?;

    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in results {
        let enriched = self
          .mongodbRelations
          .getDataRelations(result, relations.clone())
          .await?;
        enrichedResults.push(enriched);
      }
      results = enrichedResults;
    }

    Ok(results)
  }

  /// Get all records including deleted ones (no automatic isDeleted filter)
  pub async fn getAllWithDeleted(
    &self,
    nameTable: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Document>, Box<dyn std::error::Error + Send + Sync>> {
    let mut results = self.mongodbCrud.getAllWithDeleted(nameTable, filter).await?;

    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in results {
        let enriched = self
          .mongodbRelations
          .getDataRelations(result, relations.clone())
          .await?;
        enrichedResults.push(enriched);
      }
      results = enrichedResults;
    }

    Ok(results)
  }

  pub async fn get(
    &self,
    nameTable: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
    id: &str,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    let result = self.mongodbCrud.get(nameTable, filter, id).await?;

    let enrichedResult = if let Some(relations) = relations {
      self
        .mongodbRelations
        .getDataRelations(result, relations)
        .await?
    } else {
      result
    };

    Ok(enrichedResult)
  }

  pub async fn create(
    &self,
    nameTable: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbCrud.create(nameTable, document).await
  }

  pub async fn update(
    &self,
    nameTable: &str,
    id: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbCrud.update(nameTable, id, document).await
  }

  pub async fn updateAll(
    &self,
    nameTable: &str,
    documents: Vec<Document>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbCrud.updateAll(nameTable, documents).await
  }

  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbCrud.delete(nameTable, id).await
  }

  pub async fn hardDelete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbCrud.hardDelete(nameTable, id).await
  }

  // ==================== SYNC OPERATIONS ====================

  pub async fn importToLocal(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbSync.importToLocal(userId, jsonProvider).await
  }

  pub async fn exportToCloud(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.mongodbSync.exportToCloud(userId, jsonProvider).await
  }
}
