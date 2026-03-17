/* sys lib */
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/* providers */
use crate::errors::ApiResult;
use crate::providers::base_crud::CrudProvider;
use crate::providers::mongodb::mongodb_provider::MongodbProvider;
use crate::providers::relation_loader::RelationLoader;

use super::{json_crud_provider::JsonCrudProvider, json_relations_provider::JsonRelationsProvider};

#[derive(Clone)]
pub struct JsonProvider {
  pub jsonCrud: JsonCrudProvider,
  pub jsonRelations: JsonRelationsProvider,
  pub relationLoader: RelationLoader<JsonCrudProvider>,
}

impl JsonProvider {
  pub fn new(
    appHandle: AppHandle,
    envHomeFolder: String,
    envDbName: String,
    _mongodbProvider: Option<Arc<MongodbProvider>>,
  ) -> Self {
    let documentFolder = appHandle
      .path()
      .document_dir()
      .expect("Could not find documents directory");

    let appFolder = documentFolder.join(&envHomeFolder);
    std::fs::create_dir_all(&appFolder).ok();

    let dbFilePath = appFolder.join(&envDbName);
    std::fs::create_dir_all(&dbFilePath).expect("Failed to create folder for database");

    let jsonCrud = JsonCrudProvider::new(dbFilePath.clone());
    let jsonRelations = JsonRelationsProvider::new(jsonCrud.clone());
    let relationLoader = RelationLoader::new(jsonCrud.clone());

    Self {
      jsonCrud,
      jsonRelations,
      relationLoader,
    }
  }

  pub async fn create(&self, nameTable: &str, data: Value) -> ApiResult<Value> {
    self.jsonCrud.create(nameTable, data).await
  }

  pub async fn update(&self, nameTable: &str, id: &str, updates: Value) -> ApiResult<Value> {
    self.jsonCrud.update(nameTable, id, updates).await
  }

  pub async fn updateAll(&self, nameTable: &str, records: Vec<Value>) -> ApiResult<bool> {
    self.jsonCrud.updateAll(nameTable, records).await
  }

  pub async fn delete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    self.jsonCrud.delete(nameTable, id).await
  }

  pub async fn hardDelete(&self, nameTable: &str, id: &str) -> ApiResult<bool> {
    self.jsonCrud.hardDelete(nameTable, id).await
  }

  pub async fn getAll(&self, nameTable: &str, filter: Option<Value>) -> ApiResult<Vec<Value>> {
    self.jsonCrud.getAll(nameTable, filter).await
  }

  pub async fn getAllWithDeleted(
    &self,
    nameTable: &str,
    filter: Option<Value>,
  ) -> ApiResult<Vec<Value>> {
    self.jsonCrud.getAllWithDeleted(nameTable, filter).await
  }

  pub async fn get(&self, nameTable: &str, id: &str) -> ApiResult<Value> {
    self.jsonCrud.get(nameTable, id).await
  }

  pub async fn getDataTable(&self, nameTable: &str) -> ApiResult<Vec<Value>> {
    self.jsonCrud.getDataTable(nameTable).await
  }

  pub async fn saveDataTable(&self, nameTable: &str, data: &Vec<Value>) -> ApiResult<()> {
    self.jsonCrud.saveDataTable(nameTable, data).await
  }
}
