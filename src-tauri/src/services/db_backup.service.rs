use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::{json, Value};

use crate::entities::response_entity::{ResponseModel, ResponseStatus};
use crate::helpers::common::filter_deleted;
use crate::helpers::response_helper::err_response;

pub struct DbBackupService {
  json_provider: JsonProvider,
  #[allow(dead_code)]
  mongodb_provider: Mutex<Option<Arc<MongoProvider>>>,
  mongo_db_uri: String,
  mongo_db_name: String,
}

impl DbBackupService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    mongo_db_uri: String,
    mongo_db_name: String,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider: Mutex::new(mongodb_provider),
      mongo_db_uri,
      mongo_db_name,
    }
  }

  pub async fn upsert_to_json(&self, collection: &str, item: Value) -> bool {
    let id = match item.get("id").and_then(|v| v.as_str().map(String::from)) {
      Some(id) => id,
      None => return false,
    };
    let existing = self
      .json_provider
      .find_by_id(collection, &id)
      .await
      .ok()
      .flatten();
    let result = if existing.is_some() {
      self.json_provider.update(collection, &id, item).await
    } else {
      self.json_provider.insert(collection, item).await
    };
    result.is_ok()
  }

  pub async fn upsert_to_mongo(
    &self,
    mongo: &MongoProvider,
    collection: &str,
    item: Value,
  ) -> bool {
    let id = match item.get("id").and_then(|v| v.as_str().map(String::from)) {
      Some(id) => id,
      None => return false,
    };
    let existing = mongo.find_by_id(collection, &id).await.ok().flatten();
    let result = if existing.is_some() {
      mongo.update(collection, &id, item).await
    } else {
      mongo.insert(collection, item).await
    };
    result.is_ok()
  }

  pub async fn import_table(
    &self,
    mongo: &MongoProvider,
    table: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    self
      .import_table_by_field(mongo, table, "user_id", user_id, filter_deleted)
      .await
  }

  pub async fn import_table_by_id(
    &self,
    mongo: &MongoProvider,
    table: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    self
      .import_table_by_field(mongo, table, "id", user_id, filter_deleted)
      .await
  }

  pub async fn import_table_by_field(
    &self,
    mongo: &MongoProvider,
    table: &str,
    field: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    let filter = match nosql_orm::query::Filter::from_json(&serde_json::json!({ field: user_id })) {
      Ok(f) => f,
      Err(e) => {
        err_response(&format!("Filter error: {}", e));
        return 0;
      }
    };
    match mongo
      .find_many(table, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut items) => {
        if filter_deleted {
          items = crate::helpers::common::filter_deleted(items);
        }
        let count = items.len();
        for item in items {
          if !self.upsert_to_json(table, item).await {
            return 0;
          }
        }
        count
      }
      Err(_) => 0,
    }
  }

  pub async fn import_children_cascade(
    &self,
    mongo: &MongoProvider,
    child_table: &str,
    parent_table: &str,
    parent_field: &str,
    user_id: &str,
  ) -> usize {
    let user_filter =
      match nosql_orm::query::Filter::from_json(&serde_json::json!({ "user_id": user_id })) {
        Ok(f) => f,
        Err(e) => {
          err_response(&format!("Filter error: {}", e));
          return 0;
        }
      };
    let mut count = 0;

    if let Ok(parents) = mongo
      .find_many(parent_table, Some(&user_filter), None, None, None, true)
      .await
    {
      let parents = filter_deleted(parents);
      let parent_ids: Vec<String> = parents
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for parent_id in parent_ids {
        let filter = match nosql_orm::query::Filter::from_json(
          &serde_json::json!({ parent_field: parent_id }),
        ) {
          Ok(f) => f,
          Err(e) => {
            err_response(&format!("Filter error: {}", e));
            continue;
          }
        };
        if let Ok(items) = mongo
          .find_many(child_table, Some(&filter), None, None, None, true)
          .await
        {
          let items = filter_deleted(items);
          for item in items {
            if self.upsert_to_json(child_table, item).await {
              count += 1;
            }
          }
        }
      }
    }
    count
  }

  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .lock()
      .unwrap()
      .clone()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    let mut imported_count = 0;
    imported_count += self
      .import_table_by_id(&mongo, "users", &user_id, false)
      .await;
    imported_count += self.import_table(&mongo, "profiles", &user_id, false).await;
    imported_count += self.import_table(&mongo, "todos", &user_id, true).await;
    imported_count += self
      .import_table(&mongo, "categories", &user_id, false)
      .await;
    imported_count += self
      .import_table(&mongo, "daily_activities", &user_id, false)
      .await;
    imported_count += self
      .import_children_cascade(&mongo, "tasks", "todos", "todo_id", &user_id)
      .await;
    imported_count += self
      .import_children_cascade(&mongo, "subtasks", "tasks", "task_id", &user_id)
      .await;
    imported_count += self
      .import_comments_cascade(&mongo, "tasks", "subtasks", &user_id)
      .await;
    imported_count += self.import_table(&mongo, "chats", &user_id, true).await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Imported {} records", imported_count),
      data: serde_json::json!(imported_count),
    })
  }

  pub async fn export_table(
    &self,
    mongo: &MongoProvider,
    table: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    self
      .export_table_by_field(mongo, table, "user_id", user_id, filter_deleted)
      .await
  }

  pub async fn export_table_by_id(
    &self,
    mongo: &MongoProvider,
    table: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    self
      .export_table_by_field(mongo, table, "id", user_id, filter_deleted)
      .await
  }

  pub async fn export_table_by_field(
    &self,
    mongo: &MongoProvider,
    table: &str,
    field: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    let filter = match nosql_orm::query::Filter::from_json(&serde_json::json!({ field: user_id })) {
      Ok(f) => f,
      Err(e) => {
        err_response(&format!("Filter error: {}", e));
        return 0;
      }
    };
    match self
      .json_provider
      .find_many(table, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut items) => {
        if filter_deleted {
          items = crate::helpers::common::filter_deleted(items);
        }
        let count = items.len();
        for item in items {
          if !self.upsert_to_mongo(mongo, table, item).await {
            return 0;
          }
        }
        count
      }
      Err(_) => 0,
    }
  }

  pub async fn export_children_cascade(
    &self,
    mongo: &MongoProvider,
    child_table: &str,
    parent_table: &str,
    parent_field: &str,
    user_id: &str,
  ) -> usize {
    let user_filter =
      match nosql_orm::query::Filter::from_json(&serde_json::json!({ "user_id": user_id })) {
        Ok(f) => f,
        Err(e) => {
          err_response(&format!("Filter error: {}", e));
          return 0;
        }
      };
    let mut count = 0;

    if let Ok(parents) = self
      .json_provider
      .find_many(parent_table, Some(&user_filter), None, None, None, true)
      .await
    {
      let parents = filter_deleted(parents);
      let parent_ids: Vec<String> = parents
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for parent_id in parent_ids {
        let filter = match nosql_orm::query::Filter::from_json(
          &serde_json::json!({ parent_field: parent_id }),
        ) {
          Ok(f) => f,
          Err(e) => {
            err_response(&format!("Filter error: {}", e));
            continue;
          }
        };
        if let Ok(items) = self
          .json_provider
          .find_many(child_table, Some(&filter), None, None, None, true)
          .await
        {
          let items = filter_deleted(items);
          for item in items {
            if self.upsert_to_mongo(mongo, child_table, item).await {
              count += 1;
            }
          }
        }
      }
    }
    count
  }

  pub async fn import_comments_cascade(
    &self,
    mongo: &MongoProvider,
    parent_table: &str,
    _grandparent_table: &str,
    user_id: &str,
  ) -> usize {
    let user_filter =
      match nosql_orm::query::Filter::from_json(&serde_json::json!({ "user_id": user_id })) {
        Ok(f) => f,
        Err(e) => {
          err_response(&format!("Filter error: {}", e));
          return 0;
        }
      };
    let mut count = 0;

    if let Ok(parents) = mongo
      .find_many(parent_table, Some(&user_filter), None, None, None, true)
      .await
    {
      let parents = filter_deleted(parents);
      let parent_ids: Vec<String> = parents
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      let filter = Filter::In(
        "task_id".to_string(),
        parent_ids.iter().map(|id| json!(id)).collect(),
      );
      if let Ok(items) = mongo
        .find_many("comments", Some(&filter), None, None, None, true)
        .await
      {
        for item in items {
          if self.upsert_to_json("comments", item).await {
            count += 1;
          }
        }
      }
    }
    count
  }

  pub async fn export_comments_cascade(
    &self,
    mongo: &MongoProvider,
    parent_table: &str,
    user_id: &str,
  ) -> usize {
    let user_filter =
      match nosql_orm::query::Filter::from_json(&serde_json::json!({ "user_id": user_id })) {
        Ok(f) => f,
        Err(e) => {
          err_response(&format!("Filter error: {}", e));
          return 0;
        }
      };
    let mut count = 0;

    if let Ok(parents) = self
      .json_provider
      .find_many(parent_table, Some(&user_filter), None, None, None, true)
      .await
    {
      let parents = filter_deleted(parents);
      let parent_ids: Vec<String> = parents
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      let filter = Filter::In(
        "task_id".to_string(),
        parent_ids.iter().map(|id| json!(id)).collect(),
      );
      if let Ok(items) = self
        .json_provider
        .find_many("comments", Some(&filter), None, None, None, true)
        .await
      {
        for item in items {
          if self.upsert_to_mongo(mongo, "comments", item).await {
            count += 1;
          }
        }
      }
    }
    count
  }

  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = {
      let guard = self
        .mongodb_provider
        .lock()
        .map_err(|_| ResponseModel::from("Lock poisoned".to_string()))?;
      guard
        .clone()
        .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?
    };

    let mut exported_count = 0;
    exported_count += self
      .export_table_by_id(&mongo, "users", &user_id, false)
      .await;
    exported_count += self.export_table(&mongo, "profiles", &user_id, false).await;
    exported_count += self.export_table(&mongo, "todos", &user_id, true).await;
    exported_count += self
      .export_table(&mongo, "categories", &user_id, false)
      .await;
    exported_count += self
      .export_table(&mongo, "daily_activities", &user_id, false)
      .await;
    exported_count += self
      .export_children_cascade(&mongo, "tasks", "todos", "todo_id", &user_id)
      .await;
    exported_count += self
      .export_children_cascade(&mongo, "subtasks", "tasks", "task_id", &user_id)
      .await;
    exported_count += self
      .export_comments_cascade(&mongo, "tasks", &user_id)
      .await;
    exported_count += self.export_table(&mongo, "chats", &user_id, true).await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Exported {} records", exported_count),
      data: serde_json::json!(exported_count),
    })
  }

  pub async fn check_mongodb_connection_async(&self) -> bool {
    let provider = match self.mongodb_provider.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return false;
      }
    };
    match provider {
      Some(provider) => {
        let result = matches!(
          tokio::time::timeout(Duration::from_millis(500), provider.find_all("users")).await,
          Ok(Ok(_))
        );
        result
      }
      None => {
        let uri = self.mongo_db_uri.clone();
        let db_name = self.mongo_db_name.clone();
        match MongoProvider::connect(&uri, &db_name).await {
          Ok(new_provider) => {
            let new_provider = Arc::new(new_provider);
            if let Ok(mut guard) = self.mongodb_provider.lock() {
              *guard = Some(new_provider.clone());
            }
            let result = matches!(
              tokio::time::timeout(Duration::from_millis(500), new_provider.find_all("users"))
                .await,
              Ok(Ok(_))
            );
            result
          }
          Err(_) => false,
        }
      }
    }
  }
}
