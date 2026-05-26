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
  Both(Arc<JsonProvider>, Arc<MongoProvider>),
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
      DataProvider::Both(json, mongo) => {
        let local =
          DatabaseProvider::find_many(json.as_ref(), table, filter, skip, limit, sort_by, sort_asc)
            .await?;
        let cloud = DatabaseProvider::find_many(
          mongo.as_ref(),
          table,
          filter,
          skip,
          limit,
          sort_by,
          sort_asc,
        )
        .await?;
        Ok(local.into_iter().chain(cloud).collect())
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
      DataProvider::Both(json, mongo) => {
        if let Ok(result) = DatabaseProvider::find_by_id(json.as_ref(), table, id).await {
          if result.is_some() {
            return Ok(result);
          }
        }
        DatabaseProvider::find_by_id(mongo.as_ref(), table, id)
          .await
          .map_err(|e| err_response_formatted("Query failed", &e.to_string()))
      }
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
      DataProvider::Both(json, mongo) => {
        let json_result = DatabaseProvider::insert(json.as_ref(), table, data.clone()).await;
        match json_result {
          Ok(result) => {
            let _ = DatabaseProvider::insert(mongo.as_ref(), table, data).await;
            Ok(result)
          }
          Err(e) => Err(err_response_formatted(
            "Create failed in JSON",
            &e.to_string(),
          )),
        }
      }
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
      DataProvider::Both(json, mongo) => {
        let json_result = DatabaseProvider::update(json.as_ref(), table, id, data.clone()).await;
        let _ = DatabaseProvider::update(mongo.as_ref(), table, id, data).await;
        json_result.map_err(|e| err_response_formatted("Update failed in JSON", &e.to_string()))
      }
    }
  }

  #[allow(dead_code)]
  pub async fn patch(&self, table: &str, id: &str, data: Value) -> Result<Value, ResponseModel> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::patch(p.as_ref(), table, id, data)
        .await
        .map_err(|e| err_response_formatted("Patch failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => DatabaseProvider::patch(p.as_ref(), table, id, data)
        .await
        .map_err(|e| err_response_formatted("Patch failed in MongoDB", &e.to_string())),
      DataProvider::Both(json, mongo) => {
        let json_result = DatabaseProvider::patch(json.as_ref(), table, id, data.clone()).await;
        let _ = DatabaseProvider::patch(mongo.as_ref(), table, id, data).await;
        json_result.map_err(|e| err_response_formatted("Patch failed in JSON", &e.to_string()))
      }
    }
  }

  pub async fn delete(&self, table: &str, id: &str) -> Result<bool, ResponseModel> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::delete(p.as_ref(), table, id)
        .await
        .map_err(|e| err_response_formatted("Delete failed in JSON", &e.to_string())),
      DataProvider::Mongo(p) => DatabaseProvider::delete(p.as_ref(), table, id)
        .await
        .map_err(|e| err_response_formatted("Delete failed in MongoDB", &e.to_string())),
      DataProvider::Both(json, mongo) => {
        let json_result = DatabaseProvider::delete(json.as_ref(), table, id).await;
        let _ = DatabaseProvider::delete(mongo.as_ref(), table, id).await;
        json_result.map_err(|e| err_response_formatted("Delete failed in JSON", &e.to_string()))
      }
    }
  }
}
