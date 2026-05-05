/* sys */
use std::sync::Arc;

/* providers */
use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::{json, Value};

/* entities */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* helpers */
use crate::helpers::response_helper::success_response;

/* services */
use crate::services::{
  admin_manager::AdminManager, cascade::CascadeService,
  entity_resolution_service::EntityResolutionService,
};

fn filter_not_deleted(records: Vec<Value>) -> Vec<Value> {
  records
    .into_iter()
    .filter(|r| r.get("deleted_at").map(|v| v.is_null()).unwrap_or(true))
    .collect()
}

pub struct ManageDbService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub admin_manager: Option<AdminManager>,
}

impl ManageDbService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    cascade_service: CascadeService,
    entity_resolution: Arc<EntityResolutionService>,
  ) -> Self {
    let admin_manager = mongodb_provider.clone().map(|mp| {
      AdminManager::new(
        json_provider.clone(),
        mp,
        cascade_service,
        entity_resolution.clone(),
      )
    });

    Self {
      json_provider,
      mongodb_provider,
      admin_manager,
    }
  }

  async fn upsert_to_json(&self, collection: &str, item: Value) -> bool {
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

  async fn upsert_to_mongo(&self, mongo: &MongoProvider, collection: &str, item: Value) -> bool {
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

  async fn import_table(
    &self,
    mongo: &MongoProvider,
    table: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    match mongo
      .find_many(table, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut items) => {
        if filter_deleted {
          items = filter_not_deleted(items);
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

  async fn import_children_cascade(
    &self,
    mongo: &MongoProvider,
    child_table: &str,
    parent_table: &str,
    parent_field: &str,
    user_id: &str,
  ) -> usize {
    let user_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let mut count = 0;

    if let Ok(parents) = mongo
      .find_many(parent_table, Some(&user_filter), None, None, None, true)
      .await
    {
      let parents = filter_not_deleted(parents);
      let parent_ids: Vec<String> = parents
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for parent_id in parent_ids {
        let filter = Filter::Eq(parent_field.to_string(), json!(parent_id));
        if let Ok(items) = mongo
          .find_many(child_table, Some(&filter), None, None, None, true)
          .await
        {
          let items = filter_not_deleted(items);
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

  /// Import data from MongoDB to local JSON (MongoDB -> JSON for a user)
  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    let mut imported_count = 0;
    imported_count += self.import_table(mongo, "users", &user_id, false).await;
    imported_count += self.import_table(mongo, "profiles", &user_id, false).await;
    imported_count += self.import_table(mongo, "todos", &user_id, true).await;
    imported_count += self
      .import_table(mongo, "categories", &user_id, false)
      .await;
    imported_count += self
      .import_table(mongo, "daily_activities", &user_id, false)
      .await;
    imported_count += self
      .import_children_cascade(mongo, "tasks", "todos", "todo_id", &user_id)
      .await;
    imported_count += self
      .import_children_cascade(mongo, "subtasks", "tasks", "task_id", &user_id)
      .await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Imported {} records", imported_count),
      data: DataValue::String(imported_count.to_string()),
    })
  }

  async fn export_table(
    &self,
    mongo: &MongoProvider,
    table: &str,
    user_id: &str,
    filter_deleted: bool,
  ) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    match self
      .json_provider
      .find_many(table, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut items) => {
        if filter_deleted {
          items = filter_not_deleted(items);
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

  async fn export_children_cascade(
    &self,
    mongo: &MongoProvider,
    child_table: &str,
    parent_table: &str,
    parent_field: &str,
    user_id: &str,
  ) -> usize {
    let user_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let mut count = 0;

    if let Ok(parents) = self
      .json_provider
      .find_many(parent_table, Some(&user_filter), None, None, None, true)
      .await
    {
      let parents = filter_not_deleted(parents);
      let parent_ids: Vec<String> = parents
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for parent_id in parent_ids {
        let filter = Filter::Eq(parent_field.to_string(), json!(parent_id));
        if let Ok(items) = self
          .json_provider
          .find_many(child_table, Some(&filter), None, None, None, true)
          .await
        {
          let items = filter_not_deleted(items);
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

  /// Export data from local JSON to cloud MongoDB
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    let mut exported_count = 0;
    exported_count += self.export_table(mongo, "users", &user_id, false).await;
    exported_count += self.export_table(mongo, "profiles", &user_id, false).await;
    exported_count += self.export_table(mongo, "todos", &user_id, true).await;
    exported_count += self
      .export_table(mongo, "categories", &user_id, false)
      .await;
    exported_count += self
      .export_table(mongo, "daily_activities", &user_id, false)
      .await;
    exported_count += self
      .export_children_cascade(mongo, "tasks", "todos", "todo_id", &user_id)
      .await;
    exported_count += self
      .export_children_cascade(mongo, "subtasks", "tasks", "task_id", &user_id)
      .await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Exported {} records", exported_count),
      data: DataValue::String(exported_count.to_string()),
    })
  }

  /// Check if MongoDB is connected
  pub fn is_mongodb_connected(&self) -> bool {
    self.mongodb_provider.is_some()
  }

  /// Get all data for admin view (from MongoDB)
  pub async fn get_all_data_for_admin(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.get_all_data_for_admin().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Get paginated admin data for a specific table type from MongoDB
  pub async fn get_admin_data_paginated(
    &self,
    data_type: String,
    skip: u64,
    limit: u64,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      })?;

    let docs = mongo
      .find_many(&data_type, None, Some(skip), Some(limit), None, true)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting paginated {} data: {}", data_type, e),
        data: DataValue::String("".to_string()),
      })?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Retrieved {} {} records", docs.len(), data_type),
      data: crate::helpers::common::convert_data_to_object(&docs),
    })
  }

  /// Get all data for Archive page from local JSON (all users, includes deleted)
  pub async fn get_all_data_for_archive(&self) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.get_all_data_for_archive().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Get paginated archive data for a specific table type from local JSON
  pub async fn get_archive_data_paginated(
    &self,
    data_type: String,
    skip: u64,
    limit: u64,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => {
        manager
          .get_archive_data_paginated(data_type, skip, limit)
          .await
      }
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Permanently delete a record with cascade to children (MongoDB - Admin page)
  pub async fn permanently_delete_record(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.permanently_delete_record(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Permanently delete a record with cascade to children (local JSON - Archive page)
  pub async fn permanently_delete_record_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.permanently_delete_record_local(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade to children (MongoDB - Admin page)
  pub async fn toggle_delete_status(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.toggle_delete_status(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade to children (local JSON - Archive page)
  pub async fn toggle_delete_status_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match &self.admin_manager {
      Some(manager) => manager.toggle_delete_status_local(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Sync a single category to MongoDB (for team todos)
  pub async fn sync_category_to_mongo(
    &self,
    category_id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = Filter::Eq("id".to_string(), json!(category_id));
    if let Ok(categories) = self
      .json_provider
      .find_many("categories", Some(&filter), None, None, None, true)
      .await
    {
      if let Some(cat) = categories.first() {
        if let Some(mongo) = &self.mongodb_provider {
          let _ = self.upsert_to_mongo(mongo, "categories", cat.clone()).await;
        }
      }
    }
    Ok(success_response(DataValue::String(category_id)))
  }

  /// Sync a single category to JSON (for private todos)
  pub async fn sync_category_to_json(
    &self,
    category_id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    if let Some(mongo) = &self.mongodb_provider {
      let filter = Filter::Eq("id".to_string(), json!(category_id));
      if let Ok(categories) = mongo
        .find_many("categories", Some(&filter), None, None, None, true)
        .await
      {
        if let Some(cat) = categories.first() {
          let _ = self.upsert_to_json("categories", cat.clone()).await;
        }
      }
    }
    Ok(success_response(DataValue::String(category_id)))
  }
}
