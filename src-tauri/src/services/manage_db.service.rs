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

/// Filter out records where deleted_at is NOT null
fn filter_not_deleted(records: Vec<Value>) -> Vec<Value> {
  records
    .into_iter()
    .filter(|r| r.get("deleted_at").map(|v| v.is_null()).unwrap_or(true))
    .collect()
}

/// ManageDbService - Facade for database management operations
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

  async fn import_users(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("id".to_string(), json!(user_id));
    if let Ok(users) = mongo
      .find_many("users", Some(&filter), None, None, None, true)
      .await
    {
      let count = users.len();
      tracing::info!("[Import] Found {} users", count);
      for item in users {
        if let Err(e) = self.json_provider.insert("users", item).await {
          tracing::warn!("[Import] Failed to insert user in import_users: {}", e);
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn import_profiles(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(profiles) = mongo
      .find_many("profiles", Some(&filter), None, None, None, true)
      .await
    {
      let count = profiles.len();
      tracing::info!("[Import] Found {} profiles", count);
      for item in profiles {
        if let Err(e) = self.json_provider.insert("profiles", item).await {
          tracing::warn!(
            "[Import] Failed to insert profile in import_profiles: {}",
            e
          );
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn import_todos(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(todos) = mongo
      .find_many("todos", Some(&filter), None, None, None, true)
      .await
    {
      let todos = filter_not_deleted(todos);
      let count = todos.len();
      tracing::info!("[Import] Found {} todos", count);
      for item in todos {
        if let Err(e) = self.json_provider.insert("todos", item).await {
          tracing::warn!("[Import] Failed to insert todo in import_todos: {}", e);
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn import_categories(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(categories) = mongo
      .find_many("categories", Some(&filter), None, None, None, true)
      .await
    {
      let count = categories.len();
      tracing::info!("[Import] Found {} categories", count);
      for item in categories {
        if let Err(e) = self.json_provider.insert("categories", item).await {
          tracing::warn!(
            "[Import] Failed to insert category in import_categories: {}",
            e
          );
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn import_activities(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(activities) = mongo
      .find_many("daily_activities", Some(&filter), None, None, None, true)
      .await
    {
      let count = activities.len();
      tracing::info!("[Import] Found {} activities", count);
      for item in activities {
        if let Err(e) = self.json_provider.insert("daily_activities", item).await {
          tracing::warn!(
            "[Import] Failed to insert activity in import_activities: {}",
            e
          );
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn import_tasks(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let todos_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let mut count = 0;
    if let Ok(todos) = mongo
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      let todos = filter_not_deleted(todos);
      let todo_ids: Vec<String> = todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for todo_id in todo_ids {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        if let Ok(tasks) = mongo
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          let tasks = filter_not_deleted(tasks);
          for item in tasks {
            if let Err(e) = self.json_provider.insert("tasks", item).await {
              tracing::warn!("[Import] Failed to insert task in import_tasks: {}", e);
            } else {
              count += 1;
            }
          }
        }
      }
    }
    tracing::info!("[Import] Imported {} tasks", count);
    count
  }

  async fn import_subtasks(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let todos_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let mut count = 0;
    if let Ok(todos) = mongo
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      let todos = filter_not_deleted(todos);
      let todo_ids: Vec<String> = todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for todo_id in todo_ids {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        if let Ok(tasks) = mongo
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          let tasks = filter_not_deleted(tasks);
          let task_ids: Vec<String> = tasks
            .iter()
            .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
            .collect();

          for task_id in task_ids {
            let subtask_filter = Filter::Eq("task_id".to_string(), json!(task_id));
            if let Ok(subtasks) = mongo
              .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
              .await
            {
              let subtasks = filter_not_deleted(subtasks);
              for item in subtasks {
                if let Err(e) = self.json_provider.insert("subtasks", item).await {
                  tracing::warn!(
                    "[Import] Failed to insert subtask in import_subtasks: {}",
                    e
                  );
                } else {
                  count += 1;
                }
              }
            }
          }
        }
      }
    }
    tracing::info!("[Import] Imported {} subtasks", count);
    count
  }

  async fn _import_collection<F>(
    &self,
    mongo: &MongoProvider,
    collection: &str,
    filter: Filter,
  ) -> usize
  where
    F: std::future::Future<Output = Result<Vec<Value>, ()>>,
  {
    if let Ok(items) = mongo
      .find_many(collection, Some(&filter), None, None, None, true)
      .await
    {
      let count = items.len();
      for item in items {
        if self.json_provider.insert(collection, item).await.is_ok() {
          return count;
        }
      }
    }
    0
  }

  /// Import data from cloud MongoDB to local JSON
  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    tracing::info!("[Import] Starting import for user_id: {}", user_id);

    let mut imported_count = 0;
    imported_count += self.import_users(mongo, &user_id).await;
    imported_count += self.import_profiles(mongo, &user_id).await;
    imported_count += self.import_todos(mongo, &user_id).await;
    imported_count += self.import_categories(mongo, &user_id).await;
    imported_count += self.import_activities(mongo, &user_id).await;
    imported_count += self.import_tasks(mongo, &user_id).await;
    imported_count += self.import_subtasks(mongo, &user_id).await;

    tracing::info!(
      "[Import] Completed with {} records imported",
      imported_count
    );

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Imported {} records", imported_count),
      data: DataValue::String(imported_count.to_string()),
    })
  }

  async fn export_users(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("id".to_string(), json!(user_id));
    if let Ok(users) = self
      .json_provider
      .find_many("users", Some(&filter), None, None, None, true)
      .await
    {
      let count = users.len();
      tracing::info!("[Export] Found {} users", count);
      for item in users {
        if let Err(e) = mongo.insert("users", item).await {
          tracing::warn!("[Export] Failed to insert user in export_users: {}", e);
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn export_profiles(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(profiles) = self
      .json_provider
      .find_many("profiles", Some(&filter), None, None, None, true)
      .await
    {
      let count = profiles.len();
      tracing::info!("[Export] Found {} profiles", count);
      for item in profiles {
        if let Err(e) = mongo.insert("profiles", item).await {
          tracing::warn!(
            "[Export] Failed to insert profile in export_profiles: {}",
            e
          );
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn export_todos(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(todos) = self
      .json_provider
      .find_many("todos", Some(&filter), None, None, None, true)
      .await
    {
      let todos = filter_not_deleted(todos);
      let count = todos.len();
      tracing::info!("[Export] Found {} todos", count);
      for item in todos {
        if let Err(e) = mongo.insert("todos", item).await {
          tracing::warn!("[Export] Failed to insert todo in export_todos: {}", e);
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn export_categories(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(categories) = self
      .json_provider
      .find_many("categories", Some(&filter), None, None, None, true)
      .await
    {
      let count = categories.len();
      tracing::info!("[Export] Found {} categories", count);
      for item in categories {
        if let Err(e) = mongo.insert("categories", item).await {
          tracing::warn!(
            "[Export] Failed to insert category in export_categories: {}",
            e
          );
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn export_activities(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(activities) = self
      .json_provider
      .find_many("daily_activities", Some(&filter), None, None, None, true)
      .await
    {
      let count = activities.len();
      tracing::info!("[Export] Found {} activities", count);
      for item in activities {
        if let Err(e) = mongo.insert("daily_activities", item).await {
          tracing::warn!(
            "[Export] Failed to insert activity in export_activities: {}",
            e
          );
          return 0;
        }
      }
      return count;
    }
    0
  }

  async fn export_tasks(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let todos_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let mut count = 0;
    if let Ok(todos) = self
      .json_provider
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      let todos = filter_not_deleted(todos);
      let todo_ids: Vec<String> = todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for todo_id in todo_ids {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        if let Ok(tasks) = self
          .json_provider
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          let tasks = filter_not_deleted(tasks);
          for item in tasks {
            if let Err(e) = mongo.insert("tasks", item).await {
              tracing::warn!("[Export] Failed to insert task in export_tasks: {}", e);
            } else {
              count += 1;
            }
          }
        }
      }
    }
    tracing::info!("[Export] Exported {} tasks", count);
    count
  }

  async fn export_subtasks(&self, mongo: &MongoProvider, user_id: &str) -> usize {
    let todos_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    let mut count = 0;
    if let Ok(todos) = self
      .json_provider
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      let todos = filter_not_deleted(todos);
      let todo_ids: Vec<String> = todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for todo_id in todo_ids {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        if let Ok(tasks) = self
          .json_provider
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          let tasks = filter_not_deleted(tasks);
          let task_ids: Vec<String> = tasks
            .iter()
            .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
            .collect();

          for task_id in task_ids {
            let subtask_filter = Filter::Eq("task_id".to_string(), json!(task_id));
            if let Ok(subtasks) = self
              .json_provider
              .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
              .await
            {
              let subtasks = filter_not_deleted(subtasks);
              for item in subtasks {
                if let Err(e) = mongo.insert("subtasks", item).await {
                  tracing::warn!(
                    "[Export] Failed to insert subtask in export_subtasks: {}",
                    e
                  );
                } else {
                  count += 1;
                }
              }
            }
          }
        }
      }
    }
    tracing::info!("[Export] Exported {} subtasks", count);
    count
  }

  /// Export data from local JSON to cloud MongoDB
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    tracing::info!("[Export] Starting export for user_id: {}", user_id);

    let mut exported_count = 0;
    exported_count += self.export_users(mongo, &user_id).await;
    exported_count += self.export_profiles(mongo, &user_id).await;
    exported_count += self.export_todos(mongo, &user_id).await;
    exported_count += self.export_categories(mongo, &user_id).await;
    exported_count += self.export_activities(mongo, &user_id).await;
    exported_count += self.export_tasks(mongo, &user_id).await;
    exported_count += self.export_subtasks(mongo, &user_id).await;

    tracing::info!(
      "[Export] Completed with {} records exported",
      exported_count
    );

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Exported {} records", exported_count),
      data: DataValue::String(exported_count.to_string()),
    })
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
          let _ = mongo.insert("categories", cat.clone()).await;
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
          let _ = self.json_provider.insert("categories", cat.clone()).await;
        }
      }
    }
    Ok(success_response(DataValue::String(category_id)))
  }
}
