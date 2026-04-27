/* sys */
use std::sync::Arc;

/* providers */
use nosql_orm::prelude::Filter;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::json;

/* entities */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* services */
use crate::services::{
  admin_manager::AdminManager, cascade::CascadeService,
  entity_resolution_service::EntityResolutionService,
};

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

  /// Import data from cloud MongoDB to local JSON
  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    eprintln!("[Import] Starting import for user_id: {}", user_id);

    let mut imported_count = 0;

    // 1. Import user by id
    let user_filter = Filter::Eq("id".to_string(), json!(user_id));
    if let Ok(mut users) = mongo
      .find_many("users", Some(&user_filter), None, None, None, true)
      .await
    {
      eprintln!("[Import] Found {} users", users.len());
      for item in users {
        match self.json_provider.insert("users", item).await {
          Ok(_) => imported_count += 1,
          Err(e) => eprintln!("[Import] Failed to insert user: {}", e),
        }
      }
    }

    // 2. Import profile by user_id
    let profile_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut profiles) = mongo
      .find_many("profiles", Some(&profile_filter), None, None, None, true)
      .await
    {
      eprintln!("[Import] Found {} profiles", profiles.len());
      for item in profiles {
        match self.json_provider.insert("profiles", item).await {
          Ok(_) => imported_count += 1,
          Err(e) => eprintln!("[Import] Failed to insert profile: {}", e),
        }
      }
    }

    // 3. Import todos by user_id
    let todos_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut todos) = mongo
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      eprintln!("[Import] Found {} todos", todos.len());
      for item in todos {
        match self.json_provider.insert("todos", item).await {
          Ok(_) => imported_count += 1,
          Err(e) => eprintln!("[Import] Failed to insert todo: {}", e),
        }
      }
    }

    // 4. Import categories by user_id
    let categories_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut categories) = mongo
      .find_many(
        "categories",
        Some(&categories_filter),
        None,
        None,
        None,
        true,
      )
      .await
    {
      eprintln!("[Import] Found {} categories", categories.len());
      for item in categories {
        match self.json_provider.insert("categories", item).await {
          Ok(_) => imported_count += 1,
          Err(e) => eprintln!("[Import] Failed to insert category: {}", e),
        }
      }
    }

    // 5. Import daily_activities by user_id
    let activities_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut activities) = mongo
      .find_many(
        "daily_activities",
        Some(&activities_filter),
        None,
        None,
        None,
        true,
      )
      .await
    {
      eprintln!("[Import] Found {} activities", activities.len());
      for item in activities {
        match self.json_provider.insert("daily_activities", item).await {
          Ok(_) => imported_count += 1,
          Err(e) => eprintln!("[Import] Failed to insert activity: {}", e),
        }
      }
    }

    // 6. Import tasks - get all tasks and filter client-side by todo_id
    if let Ok(mut todos) = mongo
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      let todo_ids: Vec<String> = todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for todo_id in todo_ids {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        if let Ok(mut tasks) = mongo
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          for item in tasks {
            match self.json_provider.insert("tasks", item).await {
              Ok(_) => imported_count += 1,
              Err(e) => eprintln!("[Import] Failed to insert task: {}", e),
            }
          }
        }
      }
    }

    // 7. Import subtasks - get all subtasks and filter client-side by task_id
    if let Ok(mut all_tasks) = self
      .json_provider
      .find_many("tasks", None, None, None, None, true)
      .await
    {
      let task_ids: Vec<String> = all_tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for task_id in task_ids {
        let subtask_filter = Filter::Eq("task_id".to_string(), json!(task_id));
        if let Ok(mut subtasks) = mongo
          .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
          .await
        {
          for item in subtasks {
            match self.json_provider.insert("subtasks", item).await {
              Ok(_) => imported_count += 1,
              Err(e) => eprintln!("[Import] Failed to insert subtask: {}", e),
            }
          }
        }
      }
    }

    eprintln!(
      "[Import] Completed with {} records imported",
      imported_count
    );

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Imported {} records", imported_count),
      data: DataValue::String(imported_count.to_string()),
    })
  }

  /// Export data from local JSON to cloud MongoDB
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .as_ref()
      .ok_or_else(|| ResponseModel::from("MongoDB not available".to_string()))?;

    eprintln!("[Export] Starting export for user_id: {}", user_id);

    let mut exported_count = 0;

    // 1. Export user by id (NOT user_id - users have id, not user_id)
    let user_filter = Filter::Eq("id".to_string(), json!(user_id));
    if let Ok(mut users) = self
      .json_provider
      .find_many("users", Some(&user_filter), None, None, None, true)
      .await
    {
      eprintln!("[Export] Found {} users", users.len());
      for item in users {
        match mongo.insert("users", item).await {
          Ok(_) => exported_count += 1,
          Err(e) => eprintln!("[Export] Failed to insert user: {}", e),
        }
      }
    }

    // 2. Export profile by user_id
    let profile_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut profiles) = self
      .json_provider
      .find_many("profiles", Some(&profile_filter), None, None, None, true)
      .await
    {
      eprintln!("[Export] Found {} profiles", profiles.len());
      for item in profiles {
        match mongo.insert("profiles", item).await {
          Ok(_) => exported_count += 1,
          Err(e) => eprintln!("[Export] Failed to insert profile: {}", e),
        }
      }
    }

    // 3. Export todos by user_id
    let todos_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut todos) = self
      .json_provider
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      eprintln!("[Export] Found {} todos", todos.len());
      for item in todos {
        match mongo.insert("todos", item).await {
          Ok(_) => exported_count += 1,
          Err(e) => eprintln!("[Export] Failed to insert todo: {}", e),
        }
      }
    }

    // 4. Export categories by user_id
    let categories_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut categories) = self
      .json_provider
      .find_many(
        "categories",
        Some(&categories_filter),
        None,
        None,
        None,
        true,
      )
      .await
    {
      eprintln!("[Export] Found {} categories", categories.len());
      for item in categories {
        match mongo.insert("categories", item).await {
          Ok(_) => exported_count += 1,
          Err(e) => eprintln!("[Export] Failed to insert category: {}", e),
        }
      }
    }

    // 5. Export daily_activities by user_id
    let activities_filter = Filter::Eq("user_id".to_string(), json!(user_id));
    if let Ok(mut activities) = self
      .json_provider
      .find_many(
        "daily_activities",
        Some(&activities_filter),
        None,
        None,
        None,
        true,
      )
      .await
    {
      eprintln!("[Export] Found {} activities", activities.len());
      for item in activities {
        match mongo.insert("daily_activities", item).await {
          Ok(_) => exported_count += 1,
          Err(e) => eprintln!("[Export] Failed to insert activity: {}", e),
        }
      }
    }

    // 6. Export tasks - get all tasks and filter client-side by todo_id
    if let Ok(mut todos) = self
      .json_provider
      .find_many("todos", Some(&todos_filter), None, None, None, true)
      .await
    {
      let todo_ids: Vec<String> = todos
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for todo_id in todo_ids {
        let task_filter = Filter::Eq("todo_id".to_string(), json!(todo_id));
        if let Ok(mut tasks) = self
          .json_provider
          .find_many("tasks", Some(&task_filter), None, None, None, true)
          .await
        {
          for item in tasks {
            match mongo.insert("tasks", item).await {
              Ok(_) => exported_count += 1,
              Err(e) => eprintln!("[Export] Failed to insert task: {}", e),
            }
          }
        }
      }
    }

    // 7. Export subtasks - get all subtasks and filter client-side by task_id
    if let Ok(mut all_tasks) = self
      .json_provider
      .find_many("tasks", None, None, None, None, true)
      .await
    {
      let task_ids: Vec<String> = all_tasks
        .iter()
        .filter_map(|t| t.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

      for task_id in task_ids {
        let subtask_filter = Filter::Eq("task_id".to_string(), json!(task_id));
        if let Ok(mut subtasks) = self
          .json_provider
          .find_many("subtasks", Some(&subtask_filter), None, None, None, true)
          .await
        {
          for item in subtasks {
            match mongo.insert("subtasks", item).await {
              Ok(_) => exported_count += 1,
              Err(e) => eprintln!("[Export] Failed to insert subtask: {}", e),
            }
          }
        }
      }
    }

    eprintln!(
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
}
