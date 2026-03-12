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

  /// Export data from local JSON to cloud MongoDB
  /// Local records with newer updatedAt will overwrite cloud records
  pub async fn exportToCloud(
    &self,
    userId: String,
    jsonProvider: &JsonProvider,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Export todos
    let localTodos: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("todos", Some(serde_json::json!({ "userId": userId })))
      .await?;

    for localVal in localTodos {
      let id = localVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match self.mongodbCrud.get("todos", id).await {
        Ok(cloudVal) => {
          if comparison_helper::shouldUpdateTarget(&localVal, &cloudVal) {
            self.mongodbCrud.update("todos", id, localVal.clone()).await?;
          }
        }
        Err(_) => {
          self.mongodbCrud.create("todos", localVal).await?;
        }
      }
    }

    // Step 2: Export tasks
    let localTasks: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("tasks", Some(serde_json::json!({ "userId": userId })))
      .await?;

    for localVal in localTasks {
      let id = localVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match self.mongodbCrud.get("tasks", id).await {
        Ok(cloudVal) => {
          if comparison_helper::shouldUpdateTarget(&localVal, &cloudVal) {
            self.mongodbCrud.update("tasks", id, localVal.clone()).await?;
          }
        }
        Err(_) => {
          self.mongodbCrud.create("tasks", localVal).await?;
        }
      }
    }

    // Step 3: Export subtasks
    let localSubtasks: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("subtasks", Some(serde_json::json!({ "userId": userId })))
      .await?;

    for localVal in localSubtasks {
      let id = localVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match self.mongodbCrud.get("subtasks", id).await {
        Ok(cloudVal) => {
          if comparison_helper::shouldUpdateTarget(&localVal, &cloudVal) {
            self.mongodbCrud.update("subtasks", id, localVal.clone()).await?;
          }
        }
        Err(_) => {
          self.mongodbCrud.create("subtasks", localVal).await?;
        }
      }
    }

    // Step 4: Export categories
    let localCategories: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("categories", Some(serde_json::json!({ "userId": userId })))
      .await?;

    for localVal in localCategories {
      let id = localVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match self.mongodbCrud.get("categories", id).await {
        Ok(cloudVal) => {
          if comparison_helper::shouldUpdateTarget(&localVal, &cloudVal) {
            self.mongodbCrud.update("categories", id, localVal.clone()).await?;
          }
        }
        Err(_) => {
          self.mongodbCrud.create("categories", localVal).await?;
        }
      }
    }

    // Step 5: Export daily_activities
    let localActivities: Vec<Value> = jsonProvider
      .jsonCrud
      .getAll("daily_activities", Some(serde_json::json!({ "userId": userId })))
      .await?;

    for localVal in localActivities {
      let id = localVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match self.mongodbCrud.get("daily_activities", id).await {
        Ok(cloudVal) => {
          if comparison_helper::shouldUpdateTarget(&localVal, &cloudVal) {
            self.mongodbCrud.update("daily_activities", id, localVal.clone()).await?;
          }
        }
        Err(_) => {
          self.mongodbCrud.create("daily_activities", localVal).await?;
        }
      }
    }

    Ok(())
  }

  /// Import data from cloud MongoDB to local JSON
  /// Cloud records with newer updatedAt will overwrite local records
  /// Also handles soft-deleted records (isDeleted: true) from cloud
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
    let mut todoIds: Vec<String> = Vec::new();
    for todo in &cloudTodos {
      if let Some(id) = todo.get("id").and_then(|v| v.as_str()) {
        todoIds.push(id.to_string());
      }
    }

    // Process todos
    for cloudVal in cloudTodos {
      let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match jsonProvider.get("todos", id).await {
        Ok(localVal) => {
          if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
            jsonProvider.update("todos", id, cloudVal.clone()).await?;
          }
        }
        Err(_) => {
          jsonProvider.create("todos", cloudVal).await?;
        }
      }
    }

    // Step 2: Fetch tasks by todoId (not userId)
    let mut taskIds: Vec<String> = Vec::new();

    if !todoIds.is_empty() {
      let taskFilter = serde_json::json!({ "todoId": { "$in": todoIds } });
      let cloudTasks: Vec<Value> = self
        .mongodbCrud
        .getAllWithDeleted("tasks", Some(taskFilter))
        .await?;

      for cloudVal in cloudTasks {
        let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
          continue;
        }
        taskIds.push(id.to_string());

        match jsonProvider.get("tasks", id).await {
          Ok(localVal) => {
            if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
              jsonProvider.update("tasks", id, cloudVal.clone()).await?;
            }
          }
          Err(_) => {
            jsonProvider.create("tasks", cloudVal).await?;
          }
        }
      }
    }

    // Step 3: Fetch subtasks by taskId (not userId)
    if !taskIds.is_empty() {
      let subtaskFilter = serde_json::json!({ "taskId": { "$in": taskIds } });
      let cloudSubtasks: Vec<Value> = self
        .mongodbCrud
        .getAllWithDeleted("subtasks", Some(subtaskFilter))
        .await?;

      for cloudVal in cloudSubtasks {
        let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
          continue;
        }

        match jsonProvider.get("subtasks", id).await {
          Ok(localVal) => {
            if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
              jsonProvider.update("subtasks", id, cloudVal.clone()).await?;
            }
          }
          Err(_) => {
            jsonProvider.create("subtasks", cloudVal).await?;
          }
        }
      }
    }

    // Step 4: Import categories (has userId)
    let categoryFilter = serde_json::json!({ "userId": userId });
    let cloudCategories: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("categories", Some(categoryFilter))
      .await?;

    for cloudVal in cloudCategories {
      let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match jsonProvider.get("categories", id).await {
        Ok(localVal) => {
          if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
            jsonProvider.update("categories", id, cloudVal.clone()).await?;
          }
        }
        Err(_) => {
          jsonProvider.create("categories", cloudVal).await?;
        }
      }
    }

    // Step 5: Import daily_activities (has userId)
    let activityFilter = serde_json::json!({ "userId": userId });
    let cloudActivities: Vec<Value> = self
      .mongodbCrud
      .getAllWithDeleted("daily_activities", Some(activityFilter))
      .await?;

    for cloudVal in cloudActivities {
      let id = cloudVal.get("id").and_then(|v| v.as_str()).unwrap_or("");
      if id.is_empty() {
        continue;
      }

      match jsonProvider.get("daily_activities", id).await {
        Ok(localVal) => {
          if comparison_helper::shouldUpdateTarget(&cloudVal, &localVal) {
            jsonProvider.update("daily_activities", id, cloudVal.clone()).await?;
          }
        }
        Err(_) => {
          jsonProvider.create("daily_activities", cloudVal).await?;
        }
      }
    }

    Ok(())
  }
}
