use serde_json::Value;

use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;

use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::err_response_formatted;

pub enum DataProvider<'a> {
  Json(&'a JsonProvider),
  Mongo(&'a MongoProvider),
}

impl DataProvider<'_> {
  pub async fn find_many(
    &self,
    table: &str,
    filter: Option<&Filter>,
  ) -> Result<Vec<Value>, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .find_many(table, filter, None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string())),
      DataProvider::Mongo(p) => p
        .find_many(table, filter, None, None, None, false)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string())),
    }
  }

  pub async fn find_by_id(&self, table: &str, id: &str) -> Result<Option<Value>, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .find_by_id(table, id)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string())),
      DataProvider::Mongo(p) => p
        .find_by_id(table, id)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string())),
    }
  }

  pub async fn find_one(
    &self,
    table: &str,
    filter: Option<&Filter>,
  ) -> Result<Option<Value>, ResponseModel> {
    match self {
      DataProvider::Json(p) => {
        let results = p
          .find_many(table, filter, None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?;
        Ok(results.into_iter().next())
      }
      DataProvider::Mongo(p) => {
        let results = p
          .find_many(table, filter, None, None, None, false)
          .await
          .map_err(|e| err_response_formatted("Query failed", &e.to_string()))?;
        Ok(results.into_iter().next())
      }
    }
  }

  pub async fn insert(&self, table: &str, data: Value) -> Result<Value, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .insert(table, data)
        .await
        .map_err(|e| err_response_formatted("Create failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => p
        .insert(table, data)
        .await
        .map_err(|e| err_response_formatted("Create failed in MongoDB", &e.to_string())),
    }
  }

  pub async fn update(&self, table: &str, id: &str, data: Value) -> Result<Value, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .update(table, id, data)
        .await
        .map_err(|e| err_response_formatted("Update failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => p
        .update(table, id, data)
        .await
        .map_err(|e| err_response_formatted("Update failed in MongoDB", &e.to_string())),
    }
  }

  #[allow(dead_code)]
  pub async fn update_many(
    &self,
    table: &str,
    filter: Filter,
    data: Value,
  ) -> Result<usize, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .update_many(table, Some(filter), data)
        .await
        .map_err(|e| err_response_formatted("Update many failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => p
        .update_many(table, Some(filter), data)
        .await
        .map_err(|e| err_response_formatted("Update many failed in MongoDB", &e.to_string())),
    }
  }

  #[allow(dead_code)]
  pub async fn delete(&self, table: &str, id: &str) -> Result<bool, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .delete(table, id)
        .await
        .map_err(|e| err_response_formatted("Delete failed", &e.to_string())),
      DataProvider::Mongo(p) => p
        .delete(table, id)
        .await
        .map_err(|e| err_response_formatted("Delete failed", &e.to_string())),
    }
  }

  pub async fn patch(&self, table: &str, id: &str, data: Value) -> Result<Value, ResponseModel> {
    match self {
      DataProvider::Json(p) => p
        .patch(table, id, data)
        .await
        .map_err(|e| err_response_formatted("Patch failed", &e.to_string())),
      DataProvider::Mongo(p) => p
        .patch(table, id, data)
        .await
        .map_err(|e| err_response_formatted("Patch failed", &e.to_string())),
    }
  }

  #[allow(dead_code)]
  pub fn is_mongo(&self) -> bool {
    matches!(self, DataProvider::Mongo(_))
  }
}
