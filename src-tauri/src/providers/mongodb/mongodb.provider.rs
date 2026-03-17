/* sys lib */
use mongodb::{bson::Document, Collection};
use serde_json::Value;

/* providers */
use crate::errors::ApiResult;
use crate::helpers::db_helper::DbPool;
use crate::providers::base_crud::CrudProvider;
use crate::providers::relation_loader::RelationLoader;

use super::{
  mongodb_crud_provider::MongodbCrudProvider, mongodb_relations_provider::MongodbRelationsProvider,
  mongodb_sync_provider::MongodbSyncProvider,
};

#[derive(Clone)]
pub struct MongodbProvider {
  pub pool: DbPool,
  pub db: mongodb::Database,
  pub mongodbCrud: MongodbCrudProvider,
  pub mongodbRelations: MongodbRelationsProvider,
  pub mongodbSync: MongodbSyncProvider,
  pub relationLoader: RelationLoader<MongodbCrudProvider>,
}

impl MongodbProvider {
  pub async fn new(envUri: String, envDbName: String) -> ApiResult<Self> {
    let pool = DbPool::new(&envUri).await?;
    let db = pool.getDatabase(&envDbName);

    let mongodbCrud = MongodbCrudProvider::new(db.clone());
    let mongodbRelations = MongodbRelationsProvider::new(mongodbCrud.clone());
    let mongodbSync = MongodbSyncProvider::new(mongodbCrud.clone());
    let relationLoader = RelationLoader::new(mongodbCrud.clone());

    Ok(Self {
      pool,
      db,
      mongodbCrud,
      mongodbRelations,
      mongodbSync,
      relationLoader,
    })
  }

  pub async fn getDataTable(&self, nameTable: &str) -> ApiResult<Collection<Document>> {
    self.mongodbCrud.getDataTable(nameTable).await
  }

  pub async fn getAll(&self, nameTable: &str, filter: Option<Value>) -> ApiResult<Vec<Value>> {
    self.mongodbCrud.getAll(nameTable, filter).await
  }

  pub async fn getAllWithDeleted(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> ApiResult<Vec<Value>> {
    self.mongodbCrud.getAllWithDeleted(nameTable, filter).await
  }

  pub async fn get(&self, nameTable: &str, id: &str) -> ApiResult<Value> {
    self.mongodbCrud.get(nameTable, id).await
  }

  pub async fn create(&self, nameTable: &str, data: Value) -> ApiResult<Value> {
    self.mongodbCrud.create(nameTable, data).await
  }

  pub async fn update(&self, nameTable: &str, id: &str, data: Value) -> ApiResult<Value> {
    self.mongodbCrud.update(nameTable, id, data).await
  }

  pub async fn delete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    self.mongodbCrud.delete(nameTable, id).await
  }

  pub async fn hardDelete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    self.mongodbCrud.hardDelete(nameTable, id).await
  }
}
