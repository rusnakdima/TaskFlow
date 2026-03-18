/* sys lib */
use serde_json::Value;

/* providers */
use crate::providers::base_crud::CrudProvider;
use crate::providers::json_provider::JsonProvider;

use super::mongodb_crud_provider::MongodbCrudProvider;
use super::mongodb_relations_provider::MongodbRelationsProvider;

/* helpers */
use crate::helpers::comparison_helper;

/// MongodbSyncProvider - Handles data synchronization between MongoDB and JSON
#[derive(Clone)]
pub struct MongodbSyncProvider {
  pub mongodbCrud: MongodbCrudProvider,
  pub mongodbRelations: MongodbRelationsProvider,
}

impl MongodbSyncProvider {
  pub fn new(mongodbCrud: MongodbCrudProvider) -> Self {
    let mongodbRelations = MongodbRelationsProvider::new(mongodbCrud.clone());
    Self {
      mongodbCrud,
      mongodbRelations,
    }
  }

  /// Sync a single record from source to target based on updatedAt
  /// If target doesn't exist, create it. If target exists and source is newer, update it.
  async fn syncRecordToCloud(
    &self,
    table: &str,
    localVal: Value,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let id = localVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
      return Ok(());
    }

    match self.mongodbCrud.get(table, id).await {
      Ok(cloudVal) => {
        if comparison_helper::shouldUpdateTarget(&localVal, &cloudVal) {
          self.mongodbCrud.update(table, id, localVal.clone()).await?;
        }
      }
      Err(_) => {
        self.mongodbCrud.create(table, localVal).await?;
      }
    }
    Ok(())
  }

  /// Sync a single record from cloud to local based on updatedAt
  /// If local doesn't exist and cloud is not deleted, create it.
  /// If local exists and cloud is newer, update it.
  /// Deleted records (isDeleted: true) are never synced from cloud to local.
  async fn syncRecordToLocal(
    &self,
    jsonProvider: &JsonProvider,
    table: &str,
    cloudVal: Value,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
      return Ok(());
    }

    // Check if cloud record is deleted - skip syncing deleted records
    let isDeleted = cloudVal
      .get("isDeleted")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    if isDeleted {
      return Ok(());
    }

    match jsonProvider.get(table, id).await {
      Ok(localVal) => {
        // Local record exists - update if cloud is newer
        if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
          jsonProvider.update(table, id, cloudVal.clone()).await?;
        }
      }
      Err(_) => {
        // Local record doesn't exist - create it (already checked isDeleted above)
        jsonProvider.create(table, cloudVal).await?;
      }
    }
    Ok(())
  }

  /// Export data from local JSON to cloud MongoDB
  /// Local records with newer updatedAt will overwrite cloud records
  /// Excludes deleted records (isDeleted: true) - deletions stay local only
  pub async fn exportToCloud(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Export todos first to get the list of user's todo IDs
    let todoFilter = serde_json::json!({
      "userId": &userId,
      "isDeleted": false
    });

    let localTodos: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("todos", Some(todoFilter))
      .await?;

    // Collect all todo IDs for this user
    let todoIds: Vec<String> = localTodos
      .iter()
      .filter_map(|todo| todo.get("id").and_then(|v| v.as_str()).map(String::from))
      .collect();

    // Export todos
    for localVal in localTodos {
      self.syncRecordToCloud("todos", localVal).await?;
    }

    // Step 2: Export tasks by todoId (not userId)
    let mut taskIds: Vec<String> = Vec::new();

    if !todoIds.is_empty() {
      let taskFilter = serde_json::json!({ "todoId": { "$in": &todoIds } });
      let localTasks: Vec<Value> = jsonProvider
        .jsonCrud
        .getAll("tasks", Some(taskFilter))
        .await?;

      for localVal in localTasks {
        if let Some(id) = localVal.get("id").and_then(|v| v.as_str()) {
          taskIds.push(id.to_string());
        }
        self.syncRecordToCloud("tasks", localVal).await?;
      }
    }

    // Step 3: Export subtasks by taskId (not userId)
    if !taskIds.is_empty() {
      let subtaskFilter = serde_json::json!({ "taskId": { "$in": &taskIds } });
      let localSubtasks: Vec<Value> = jsonProvider
        .jsonCrud
        .getAll("subtasks", Some(subtaskFilter))
        .await?;

      for localVal in localSubtasks {
        self.syncRecordToCloud("subtasks", localVal).await?;
      }
    }

    // Step 4: Export categories (has userId)
    let categoryFilter = serde_json::json!({
      "userId": &userId,
      "isDeleted": false
    });

    let localCategories: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("categories", Some(categoryFilter))
      .await?;

    for localVal in localCategories {
      self.syncRecordToCloud("categories", localVal).await?;
    }

    // Step 5: Export comments - fetch all and filter manually (JSON doesn't support $or)
    // Comments can have userId, taskId, subtaskId, or todoId
    let allLocalComments: Vec<Value> = jsonProvider
      .jsonCrud
      .getAllWithDeleted("comments", None)
      .await?;

    for localVal in allLocalComments {
      // Skip deleted comments
      let isDeleted = localVal
        .get("isDeleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      if isDeleted {
        continue;
      }

      // Check if comment belongs to this user's todos/tasks/subtasks
      let belongsToUser = localVal
        .get("userId")
        .and_then(|v| v.as_str())
        .map(|v| v == userId)
        .unwrap_or(false)
        || localVal
          .get("todoId")
          .and_then(|v| v.as_str())
          .map(|v| todoIds.contains(&v.to_string()))
          .unwrap_or(false)
        || localVal
          .get("taskId")
          .and_then(|v| v.as_str())
          .map(|v| taskIds.contains(&v.to_string()))
          .unwrap_or(false)
        || localVal
          .get("subtaskId")
          .and_then(|v| v.as_str())
          .map(|v| taskIds.contains(&v.to_string()))
          .unwrap_or(false);

      if belongsToUser {
        self.syncRecordToCloud("comments", localVal).await?;
      }
    }

    // Step 6: Export chats - fetch all and filter manually (JSON doesn't support $or)
    // Chats can have todoId or userId
    let allLocalChats: Vec<Value> = jsonProvider
      .jsonCrud
      .getAllWithDeleted("chats", None)
      .await?;

    for localVal in allLocalChats {
      // Skip deleted chats
      let isDeleted = localVal
        .get("isDeleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      if isDeleted {
        continue;
      }

      // Check if chat belongs to this user's todos
      let belongsToUser = localVal
        .get("todoId")
        .and_then(|v| v.as_str())
        .map(|v| todoIds.contains(&v.to_string()))
        .unwrap_or(false)
        || localVal
          .get("userId")
          .and_then(|v| v.as_str())
          .map(|v| v == userId)
          .unwrap_or(false);

      if belongsToUser {
        self.syncRecordToCloud("chats", localVal).await?;
      }
    }

    // Step 7: Export profiles (has userId) - exclude deleted
    let profileFilter = serde_json::json!({
      "userId": &userId,
      "isDeleted": false
    });

    let localProfiles: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("profiles", Some(profileFilter))
      .await?;

    for localVal in localProfiles {
      self.syncRecordToCloud("profiles", localVal).await?;
    }

    // Step 8: Export only this user's user record (id == userId). Never push other users from local.
    if let Ok(localUser) = jsonProvider.get("users", &userId).await {
      let isDeleted = localUser
        .get("isDeleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      if !isDeleted {
        self.syncRecordToCloud("users", localUser).await?;
      }
    }

    // Step 9: Export daily_activities (has userId) - exclude deleted
    let activityFilter = serde_json::json!({
      "userId": &userId,
      "isDeleted": false
    });

    let localActivities: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("daily_activities", Some(activityFilter))
      .await?;

    for localVal in localActivities {
      self.syncRecordToCloud("daily_activities", localVal).await?;
    }

    Ok(())
  }

  /// Import data from cloud MongoDB to local JSON
  /// Cloud records with newer updatedAt will overwrite local records
  /// Excludes deleted records (isDeleted: true) - deletions don't sync from cloud
  pub async fn importToLocal(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Import todos first to get the list of user's todo IDs
    let todoFilter = serde_json::json!({ "userId": userId });
    let cloudTodos: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("todos", Some(todoFilter))
      .await?;

    // Collect all todo IDs for this user
    let todoIds: Vec<String> = cloudTodos
      .iter()
      .filter_map(|todo| todo.get("id").and_then(|v| v.as_str()).map(String::from))
      .collect();

    // Process todos
    for cloudVal in cloudTodos {
      self
        .syncRecordToLocal(jsonProvider, "todos", cloudVal)
        .await?;
    }

    // Step 2: Fetch tasks by todoId (not userId)
    let mut taskIds: Vec<String> = Vec::new();

    if !todoIds.is_empty() {
      let taskFilter = serde_json::json!({ "todoId": { "$in": &todoIds } });
      let cloudTasks: Vec<Value> = self
        .mongodbCrud
        .getAllWithDeleted("tasks", Some(taskFilter))
        .await?;

      for cloudVal in cloudTasks {
        if let Some(id) = cloudVal.get("id").and_then(|v| v.as_str()) {
          taskIds.push(id.to_string());
        }
        self
          .syncRecordToLocal(jsonProvider, "tasks", cloudVal)
          .await?;
      }
    }

    // Step 3: Fetch subtasks by taskId (not userId)
    if !taskIds.is_empty() {
      let subtaskFilter = serde_json::json!({ "taskId": { "$in": &taskIds } });
      let cloudSubtasks: Vec<Value> = self
        .mongodbCrud
        .getAllWithDeleted("subtasks", Some(subtaskFilter))
        .await?;

      for cloudVal in cloudSubtasks {
        self
          .syncRecordToLocal(jsonProvider, "subtasks", cloudVal)
          .await?;
      }
    }

    // Step 4: Import categories (has userId)
    let categoryFilter = serde_json::json!({ "userId": userId });
    let cloudCategories: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("categories", Some(categoryFilter))
      .await?;

    for cloudVal in cloudCategories {
      self
        .syncRecordToLocal(jsonProvider, "categories", cloudVal)
        .await?;
    }

    // Step 5: Import daily_activities (has userId)
    let activityFilter = serde_json::json!({ "userId": userId });
    let cloudActivities: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("daily_activities", Some(activityFilter))
      .await?;

    for cloudVal in cloudActivities {
      self
        .syncRecordToLocal(jsonProvider, "daily_activities", cloudVal)
        .await?;
    }

    // Step 6: Import comments (has userId or taskId or subtaskId)
    // Fetch all comments for this user's todos/tasks/subtasks
    if !todoIds.is_empty() && !taskIds.is_empty() {
      let commentFilter = serde_json::json!({
        "$or": [
          { "userId": userId },
          { "taskId": { "$in": &taskIds } },
          { "todoId": { "$in": &todoIds } }
        ]
      });
      let cloudComments: Vec<Value> = self
        .mongodbCrud
        .getAllWithDeleted("comments", Some(commentFilter))
        .await?;

      for cloudVal in cloudComments {
        self
          .syncRecordToLocal(jsonProvider, "comments", cloudVal)
          .await?;
      }
    }

    // Step 7: Import chats (has todoId or userId)
    if !todoIds.is_empty() {
      let chatFilter = serde_json::json!({
        "$or": [
          { "todoId": { "$in": &todoIds } },
          { "userId": userId }
        ]
      });
      let cloudChats: Vec<Value> = self
        .mongodbCrud
        .getAllWithDeleted("chats", Some(chatFilter))
        .await?;

      for cloudVal in cloudChats {
        self
          .syncRecordToLocal(jsonProvider, "chats", cloudVal)
          .await?;
      }
    }

    // Step 8: Import users (cloud → local ONLY, local never overwrites cloud)
    // This allows admin role changes and other updates to propagate to local
    let userFilter = serde_json::json!({ "id": userId });
    let cloudUsers: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("users", Some(userFilter))
      .await?;

    for cloudVal in cloudUsers {
      self
        .syncRecordToLocal(jsonProvider, "users", cloudVal)
        .await?;
    }

    // Step 9: Import profiles (cloud → local ONLY, local never overwrites cloud)
    let profileFilter = serde_json::json!({ "userId": userId });
    let cloudProfiles: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("profiles", Some(profileFilter))
      .await?;

    for cloudVal in cloudProfiles {
      self
        .syncRecordToLocal(jsonProvider, "profiles", cloudVal)
        .await?;
    }

    Ok(())
  }
}
