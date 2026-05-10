use serde_json::Value;
use std::sync::Arc;

use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;

use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::err_response_formatted;

#[derive(Clone)]
pub enum DataProvider {
  Json(Arc<JsonProvider>),
  Mongo(Arc<MongoProvider>),
}

impl DataProvider {
  pub async fn find_many(
    &self,
    table: &str,
    filter: Option<&Filter>,
    skip: Option<u64>,
    limit: Option<u64>,
    sort_by: Option<&str>,
    sort_asc: bool,
  ) -> Result<Vec<Value>, ResponseModel> {
    match self {
      DataProvider::Json(p) => {
        DatabaseProvider::find_many(p.as_ref(), table, filter, skip, limit, sort_by, sort_asc)
          .await
          .map_err(|e| err_response_formatted("Query failed", &e.to_string()))
      }
      DataProvider::Mongo(p) => {
        DatabaseProvider::find_many(p.as_ref(), table, filter, skip, limit, sort_by, sort_asc)
          .await
          .map_err(|e| err_response_formatted("Query failed", &e.to_string()))
      }
    }
  }

  pub async fn find_by_id(&self, table: &str, id: &str) -> Result<Option<Value>, ResponseModel> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::find_by_id(p.as_ref(), table, id)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string())),
      DataProvider::Mongo(p) => DatabaseProvider::find_by_id(p.as_ref(), table, id)
        .await
        .map_err(|e| err_response_formatted("Query failed", &e.to_string())),
    }
  }

  pub async fn insert(&self, table: &str, data: Value) -> Result<Value, ResponseModel> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::insert(p.as_ref(), table, data)
        .await
        .map_err(|e| err_response_formatted("Create failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => DatabaseProvider::insert(p.as_ref(), table, data)
        .await
        .map_err(|e| err_response_formatted("Create failed in MongoDB", &e.to_string())),
    }
  }

  pub async fn update(&self, table: &str, id: &str, data: Value) -> Result<Value, ResponseModel> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::update(p.as_ref(), table, id, data)
        .await
        .map_err(|e| err_response_formatted("Update failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => DatabaseProvider::update(p.as_ref(), table, id, data)
        .await
        .map_err(|e| err_response_formatted("Update failed in MongoDB", &e.to_string())),
    }
  }
}
