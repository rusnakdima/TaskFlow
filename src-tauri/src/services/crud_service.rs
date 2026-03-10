use crate::helpers::activity_log::ActivityLogHelper;
use crate::helpers::bson_helper::valueToDocument;
use crate::helpers::common::getProviderType;
use crate::helpers::response_helper::{errResponse, errResponseFormatted, successResponse};
use crate::models::{
  provider_type_model::ProviderType,
  relation_obj::RelationObj,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
  table_model::{validateModel, validateTable},
};
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};
use chrono::Utc;
use futures::future::BoxFuture;
use futures::FutureExt;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct CrudService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
  pub activityLogHelper: Arc<ActivityLogHelper>,
}

impl CrudService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongodbProvider>>,
    activityLogHelper: Arc<ActivityLogHelper>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      activityLogHelper,
    }
  }

  /// Get current UTC timestamp in RFC3339 format
  fn getCurrentTimestamp() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
  }

  /// Helper to get userId for a given entity in a given table
  async fn getUserIdForEntity(&self, table: &str, data: &Value) -> Option<String> {
    if let Some(userId) = data.get("userId").and_then(|v| v.as_str()) {
      return Some(userId.to_string());
    }

    if table == "tasks" {
      if let Some(todoId) = data.get("todoId").and_then(|v| v.as_str()) {
        // Check JSON first
        if let Ok(todo) = self.jsonProvider.get("todos", None, None, todoId).await {
          return todo
            .get("userId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        }
        // Check Mongo if available
        if let Some(mongodb) = &self.mongodbProvider {
          if let Ok(todo) = mongodb.get("todos", None, None, todoId).await {
            return todo
              .get("userId")
              .and_then(|v| v.as_str())
              .map(|s| s.to_string());
          }
        }
      }
    }

    if table == "subtasks" {
      if let Some(taskId) = data.get("taskId").and_then(|v| v.as_str()) {
        // Check JSON first
        if let Ok(task) = self.jsonProvider.get("tasks", None, None, taskId).await {
          if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
            if let Ok(todo) = self.jsonProvider.get("todos", None, None, todoId).await {
              return todo
                .get("userId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            }
          }
        }
        // Check Mongo if available
        if let Some(mongodb) = &self.mongodbProvider {
          if let Ok(task) = mongodb.get("tasks", None, None, taskId).await {
            if let Some(todoId) = task.get("todoId").and_then(|v| v.as_str()) {
              if let Ok(todo) = mongodb.get("todos", None, None, todoId).await {
                return todo
                  .get("userId")
                  .and_then(|v| v.as_str())
                  .map(|s| s.to_string());
              }
            }
          }
        }
      }
    }

    None
  }

  /// Apply timestamps to data object
  fn applyTimestamps(&self, data: &mut Value, isCreate: bool) {
    if let Some(dataObj) = data.as_object_mut() {
      let timestamp = Self::getCurrentTimestamp();
      if isCreate && !dataObj.contains_key("createdAt") {
        dataObj.insert("createdAt".to_string(), Value::String(timestamp.clone()));
      }
      dataObj.insert("updatedAt".to_string(), Value::String(timestamp));
    }
  }

  /// Log activity based on table and operation
  async fn logAction(&self, table: &str, operation: &str, data: &Value, original: Option<&Value>) {
    let sourceData = original.unwrap_or(data);
    let userId = match self.getUserIdForEntity(table, sourceData).await {
      Some(id) => id,
      None => return,
    };

    let activityType = match (table, operation) {
      ("todos", "create") => "todo_created",
      ("todos", "update") => "todo_updated",
      ("todos", "delete") => "todo_deleted",
      ("tasks", "create") => "task_created",
      ("tasks", "delete") => "task_deleted",
      ("tasks", "update") => {
        let origStatus = original
          .and_then(|o| o.get("status"))
          .and_then(|v| v.as_str());
        let newStatus = data.get("status").and_then(|v| v.as_str());
        if newStatus == Some("completed") && origStatus != Some("completed") {
          "task_completed"
        } else {
          "task_updated"
        }
      }
      ("subtasks", "create") => "subtask_created",
      ("subtasks", "delete") => "subtask_deleted",
      ("subtasks", "update") => {
        let origStatus = original
          .and_then(|o| o.get("status"))
          .and_then(|v| v.as_str());
        let newStatus = data.get("status").and_then(|v| v.as_str());
        if newStatus == Some("completed") && origStatus != Some("completed") {
          "subtask_completed"
        } else {
          "subtask_updated"
        }
      }
      _ => "",
    };

    if !activityType.is_empty() {
      let _ = self
        .activityLogHelper
        .logActivity(userId, activityType, 1)
        .await;
    }
  }

  /// Collect all cascade IDs recursively without performing updates
  fn collectCascadeIds<'a>(
    &'a self,
    table: &'a str,
    id: &'a str,
    isRestore: bool,
    taskIds: &'a mut Vec<String>,
    subtaskIds: &'a mut Vec<String>,
    chatIds: &'a mut Vec<String>,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      if table == "todos" {
        // Get all tasks for this todo
        let tasks = self
          .jsonProvider
          .getAll("tasks", Some(json!({"todoId": id})), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for task in tasks {
          if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
            taskIds.push(taskId.to_string());
            // Recursively collect subtasks
            self.collectCascadeIds("tasks", taskId, isRestore, taskIds, subtaskIds, chatIds).await?;
          }
        }

        // Get all chats for this todo
        let chats = self
          .jsonProvider
          .getAll("chats", Some(json!({ "todoId": id })), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for chat in chats {
          if let Some(chatId) = chat.get("id").and_then(|v| v.as_str()) {
            chatIds.push(chatId.to_string());
          }
        }
      } else if table == "tasks" {
        // Get all subtasks for this task
        let subtasks = self
          .jsonProvider
          .getAll("subtasks", Some(json!({"taskId": id})), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for subtask in subtasks {
          if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
            subtaskIds.push(subtaskId.to_string());
          }
        }
      }
      Ok(())
    }
    .boxed()
  }

  /// Perform cascade operations for JSON provider with TRUE batched updates using updateAll
  fn handleJsonCascade<'a>(
    &'a self,
    table: &'a str,
    id: &'a str,
    isRestore: bool,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      let timestamp = Self::getCurrentTimestamp();

      // Collect all IDs first (recursive)
      let mut taskIds: Vec<String> = Vec::new();
      let mut subtaskIds: Vec<String> = Vec::new();
      let mut chatIds: Vec<String> = Vec::new();

      self.collectCascadeIds(table, id, isRestore, &mut taskIds, &mut subtaskIds, &mut chatIds).await?;

      // TRUE BATCH UPDATE: Get all tasks, mark as deleted, save once
      if !taskIds.is_empty() {
        let allTasks = self
          .jsonProvider
          .getAll("tasks", None, None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;
        
        let mut tasksToUpdate: Vec<Value> = Vec::new();
        for task in allTasks {
          if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
            if taskIds.contains(&taskId.to_string()) {
              let mut taskWithUpdates = task.clone();
              if let Some(obj) = taskWithUpdates.as_object_mut() {
                obj.insert("isDeleted".to_string(), Value::Bool(!isRestore));
                obj.insert("updatedAt".to_string(), Value::String(timestamp.clone()));
              }
              tasksToUpdate.push(taskWithUpdates);
            }
          }
        }
        
        if !tasksToUpdate.is_empty() {
          let _ = self.jsonProvider.updateAll("tasks", tasksToUpdate).await;
        }
      }

      // TRUE BATCH UPDATE: Get all subtasks, mark as deleted, save once
      if !subtaskIds.is_empty() {
        let allSubtasks = self
          .jsonProvider
          .getAll("subtasks", None, None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;
        
        let mut subtasksToUpdate: Vec<Value> = Vec::new();
        for subtask in allSubtasks {
          if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
            if subtaskIds.contains(&subtaskId.to_string()) {
              let mut subtaskWithUpdates = subtask.clone();
              if let Some(obj) = subtaskWithUpdates.as_object_mut() {
                obj.insert("isDeleted".to_string(), Value::Bool(!isRestore));
                obj.insert("updatedAt".to_string(), Value::String(timestamp.clone()));
              }
              subtasksToUpdate.push(subtaskWithUpdates);
            }
          }
        }
        
        if !subtasksToUpdate.is_empty() {
          let _ = self.jsonProvider.updateAll("subtasks", subtasksToUpdate).await;
        }
      }

      // TRUE BATCH UPDATE: Get all chats, mark as deleted, save once
      if !chatIds.is_empty() {
        let allChats = self
          .jsonProvider
          .getAll("chats", None, None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;
        
        let mut chatsToUpdate: Vec<Value> = Vec::new();
        for chat in allChats {
          if let Some(chatId) = chat.get("id").and_then(|v| v.as_str()) {
            if chatIds.contains(&chatId.to_string()) {
              let mut chatWithUpdates = chat.clone();
              if let Some(obj) = chatWithUpdates.as_object_mut() {
                obj.insert("isDeleted".to_string(), Value::Bool(!isRestore));
                obj.insert("updatedAt".to_string(), Value::String(timestamp.clone()));
              }
              chatsToUpdate.push(chatWithUpdates);
            }
          }
        }
        
        if !chatsToUpdate.is_empty() {
          let _ = self.jsonProvider.updateAll("chats", chatsToUpdate).await;
        }
      }

      Ok(())
    }
    .boxed()
  }

  /// Collect all cascade IDs recursively for MongoDB without performing updates
  fn collectMongoCascadeIds<'a>(
    &'a self,
    mongodb: &'a Arc<MongodbProvider>,
    table: &'a str,
    id: &'a str,
    isRestore: bool,
    taskIds: &'a mut Vec<String>,
    subtaskIds: &'a mut Vec<String>,
    chatIds: &'a mut Vec<String>,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      if table == "todos" {
        // Get all tasks for this todo
        let tasks = mongodb
          .getAll("tasks", Some(mongodb::bson::doc! { "todoId": id }), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for task in tasks {
          if let Ok(taskId) = task.get_str("id") {
            taskIds.push(taskId.to_string());
            // Recursively collect subtasks
            self.collectMongoCascadeIds(mongodb, "tasks", taskId, isRestore, taskIds, subtaskIds, chatIds).await?;
          }
        }

        // Get all chats for this todo
        let chats = mongodb
          .getAll("chats", Some(mongodb::bson::doc! { "todoId": id }), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for chat in chats {
          if let Ok(chatId) = chat.get_str("id") {
            chatIds.push(chatId.to_string());
          }
        }
      } else if table == "tasks" {
        // Get all subtasks for this task
        let subtasks = mongodb
          .getAll("subtasks", Some(mongodb::bson::doc! { "taskId": id }), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for subtask in subtasks {
          if let Ok(subtaskId) = subtask.get_str("id") {
            subtaskIds.push(subtaskId.to_string());
          }
        }
      }
      Ok(())
    }
    .boxed()
  }

  /// Perform cascade operations for MongoDB provider with TRUE batched updates using update_many
  fn handleMongoCascade<'a>(
    &'a self,
    mongodb: &'a Arc<MongodbProvider>,
    table: &'a str,
    id: &'a str,
    isRestore: bool,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      let timestamp = Self::getCurrentTimestamp();
      let updateDoc = mongodb::bson::doc! { "$set": { "isDeleted": !isRestore, "updatedAt": timestamp } };

      // Collect all IDs first (recursive)
      let mut taskIds: Vec<String> = Vec::new();
      let mut subtaskIds: Vec<String> = Vec::new();
      let mut chatIds: Vec<String> = Vec::new();

      self.collectMongoCascadeIds(mongodb, table, id, isRestore, &mut taskIds, &mut subtaskIds, &mut chatIds).await?;

      // TRUE BATCH UPDATE: Update all tasks in single query using $in
      if !taskIds.is_empty() {
        let taskIdsBson: Vec<mongodb::bson::Bson> = taskIds.iter().map(|id| mongodb::bson::Bson::String(id.clone())).collect();
        let filter = mongodb::bson::doc! { "id": { "$in": taskIdsBson } };
        let _ = mongodb.mongodbCrud.db.collection::<mongodb::bson::Document>("tasks")
          .update_many(filter, updateDoc.clone())
          .await;
      }

      // TRUE BATCH UPDATE: Update all subtasks in single query using $in
      if !subtaskIds.is_empty() {
        let subtaskIdsBson: Vec<mongodb::bson::Bson> = subtaskIds.iter().map(|id| mongodb::bson::Bson::String(id.clone())).collect();
        let filter = mongodb::bson::doc! { "id": { "$in": subtaskIdsBson } };
        let _ = mongodb.mongodbCrud.db.collection::<mongodb::bson::Document>("subtasks")
          .update_many(filter, updateDoc.clone())
          .await;
      }

      // TRUE BATCH UPDATE: Update all chats in single query using $in
      if !chatIds.is_empty() {
        let chatIdsBson: Vec<mongodb::bson::Bson> = chatIds.iter().map(|id| mongodb::bson::Bson::String(id.clone())).collect();
        let filter = mongodb::bson::doc! { "id": { "$in": chatIdsBson } };
        let _ = mongodb.mongodbCrud.db.collection::<mongodb::bson::Document>("chats")
          .update_many(filter, updateDoc.clone())
          .await;
      }

      Ok(())
    }
    .boxed()
  }

  pub async fn execute(
    &self,
    operation: String,
    table: String,
    id: Option<String>,
    data: Option<Value>,
    filter: Option<Value>,
    relations: Option<Vec<RelationObj>>,
    syncMetadata: Option<SyncMetadata>,
  ) -> Result<ResponseModel, ResponseModel> {
    validateTable(&table).map_err(|e| errResponse(&e))?;

    let syncMeta = syncMetadata.unwrap_or(SyncMetadata {
      isOwner: true,
      isPrivate: true,
    });

    match operation.as_str() {
      "getAll" => {
        self
          .getAll(&table, filter.unwrap_or(json!({})), relations, syncMeta)
          .await
      }
      "read" | "get" => {
        self
          .get(
            &table,
            filter.unwrap_or(json!({})),
            relations,
            syncMeta,
            id.unwrap_or_default().as_str(),
          )
          .await
      }
      "create" => {
        let data = data.ok_or_else(|| errResponse("Data required"))?;
        let validated = validateModel(&table, &data, true).map_err(|e| errResponse(&e))?;
        self.create(&table, validated, syncMeta).await
      }
      "update" => {
        let id = id.ok_or_else(|| errResponse("ID required"))?;
        let data = data.ok_or_else(|| errResponse("Data required"))?;
        let validated = validateModel(&table, &data, false).map_err(|e| errResponse(&e))?;
        self.update(&table, &id, validated, syncMeta).await
      }
      "updateAll" => {
        let data = data.ok_or_else(|| errResponse("Data required"))?;
        self.updateAll(&table, data, syncMeta).await
      }
      "delete" => {
        let id = id.ok_or_else(|| errResponse("ID required"))?;
        self.delete(&table, &id, syncMeta).await
      }
      _ => Err(errResponse(&format!("Invalid operation: {}", operation))),
    }
  }

  async fn getAll(
    &self,
    table: &str,
    filter: Value,
    relations: Option<Vec<RelationObj>>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    match getProviderType(&syncMetadata)? {
      ProviderType::Json => {
        let result = self
          .jsonProvider
          .getAll(table, Some(filter), relations)
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(result),
        })
      }
      ProviderType::Mongo => {
        let mongodb = self
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("MongoDB unavailable"))?;
        let result = mongodb
          .getAll(table, Some(valueToDocument(&filter)), relations)
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;
        let values = result
          .into_iter()
          .filter_map(|doc| serde_json::to_value(doc).ok())
          .collect();
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(values),
        })
      }
    }
  }

  async fn get(
    &self,
    table: &str,
    filter: Value,
    relations: Option<Vec<RelationObj>>,
    syncMetadata: SyncMetadata,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    match getProviderType(&syncMetadata)? {
      ProviderType::Json => {
        let result = self
          .jsonProvider
          .get(table, Some(filter), relations, id)
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(result),
        })
      }
      ProviderType::Mongo => {
        let mongodb = self
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("MongoDB unavailable"))?;
        let docFilter = if filter.is_object() {
          Some(valueToDocument(&filter))
        } else {
          None
        };
        let result = mongodb
          .get(table, docFilter, relations, id)
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;
        let value = serde_json::to_value(result)
          .map_err(|e| errResponseFormatted("Conversion error", &e.to_string()))?;
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(value),
        })
      }
    }
  }

  async fn create(
    &self,
    table: &str,
    mut data: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.applyTimestamps(&mut data, true);

    // Special handling for profile creation
    if table == "profiles" {
      return self.createProfileWithUserUpdate(data).await;
    }

    match getProviderType(&syncMetadata)? {
      ProviderType::Json => {
        self
          .jsonProvider
          .create(table, data.clone())
          .await
          .map_err(|e| errResponseFormatted("Error creating data", &e.to_string()))?;
        self.logAction(table, "create", &data, None).await;
        Ok(successResponse(DataValue::Object(data)))
      }
      ProviderType::Mongo => {
        let mongodb = self
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("MongoDB unavailable"))?;
        let doc = mongodb::bson::to_document(&data)
          .map_err(|e| errResponseFormatted("BSON error", &e.to_string()))?;
        mongodb
          .create(table, doc)
          .await
          .map_err(|e| errResponseFormatted("Error creating data", &e.to_string()))?;
        Ok(successResponse(DataValue::Object(data)))
      }
    }
  }

  /// Special handler for profile creation - updates user's profileId in both JSON and MongoDB
  async fn createProfileWithUserUpdate(
    &self,
    profileData: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    use mongodb::bson::{to_bson, Bson};

    // Create profile in local JSON first
    self
      .jsonProvider
      .create("profiles", profileData.clone())
      .await
      .map_err(|e| errResponseFormatted("Error creating profile", &e.to_string()))?;

    // Get userId and profileId
    let userId = profileData
      .get("userId")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();
    let profileId = profileData
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or_default()
      .to_string();

    if userId.is_empty() || profileId.is_empty() {
      return Err(errResponse("Invalid profile data: missing userId or id"));
    }

    let now = Self::getCurrentTimestamp();

    // Update user in MongoDB
    if let Some(ref mongodb) = self.mongodbProvider {
      match mongodb.get("users", Some(mongodb::bson::doc! { "id": &userId }), None, "").await {
        Ok(userDoc) => {
          let mut updatedUser: crate::models::user_model::UserModel =
            match mongodb::bson::from_document(userDoc) {
              Ok(user) => user,
              Err(e) => {
                return Err(errResponseFormatted("Failed to parse user from MongoDB", &e.to_string()));
              }
            };
          updatedUser.profileId = profileId.clone();
          updatedUser.updatedAt = now.clone();

          let userRecord = match to_bson(&updatedUser) {
            Ok(Bson::Document(doc)) => doc,
            _ => {
              return Err(errResponse("Error serializing user for MongoDB"));
            }
          };

          let _ = mongodb.update("users", &userId, userRecord).await;
        }
        Err(_) => {
          // User not found in MongoDB, skip
        }
      }
    }

    // Update user in local JSON
    match self.jsonProvider.get("users", None, None, &userId).await {
      Ok(userValue) => {
        let mut updatedUser = userValue.clone();
        if let Some(obj) = updatedUser.as_object_mut() {
          obj.insert("profileId".to_string(), Value::String(profileId.clone()));
          obj.insert("updatedAt".to_string(), Value::String(now.clone()));
        }

        let _ = self.jsonProvider.update("users", &userId, updatedUser).await;
      }
      Err(_) => {
        // User not found in local JSON, skip
      }
    }

    // Sync profile to MongoDB if available
    if let Some(ref mongodb) = self.mongodbProvider {
      let doc = mongodb::bson::to_document(&profileData)
        .map_err(|e| errResponseFormatted("BSON error", &e.to_string()))?;
      let _ = mongodb.create("profiles", doc).await;
    }

    self.logAction("profiles", "create", &profileData, None).await;
    Ok(successResponse(DataValue::Object(profileData)))
  }

  async fn update(
    &self,
    table: &str,
    id: &str,
    mut data: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self.applyTimestamps(&mut data, false);
    let providerType = getProviderType(&syncMetadata)?;
    let isRestore = data.get("isDeleted").and_then(|v| v.as_bool()) == Some(false);

    match providerType {
      ProviderType::Json => {
        if isRestore {
          self.handleJsonCascade(table, id, true).await?;
        }
        let original = self.jsonProvider.get(table, None, None, id).await.ok();
        self
          .jsonProvider
          .update(table, id, data.clone())
          .await
          .map_err(|e| errResponseFormatted("Error updating data", &e.to_string()))?;
        self
          .logAction(table, "update", &data, original.as_ref())
          .await;
        Ok(successResponse(DataValue::Object(data)))
      }
      ProviderType::Mongo => {
        let mongodb = self
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("MongoDB unavailable"))?;
        if isRestore {
          self.handleMongoCascade(mongodb, table, id, true).await?;
        }
        let mut doc = mongodb::bson::to_document(&data)
          .map_err(|e| errResponseFormatted("BSON error", &e.to_string()))?;
        // Remove _id field as it's immutable in MongoDB
        doc.remove("_id");
        mongodb
          .update(table, id, doc)
          .await
          .map_err(|e| errResponseFormatted("Error updating data", &e.to_string()))?;
        Ok(successResponse(DataValue::Object(data)))
      }
    }
  }

  async fn delete(
    &self,
    table: &str,
    id: &str,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    match getProviderType(&syncMetadata)? {
      ProviderType::Json => {
        let original = self.jsonProvider.get(table, None, None, id).await.ok();
        self.handleJsonCascade(table, id, false).await?;
        self
          .jsonProvider
          .delete(table, id)
          .await
          .map_err(|e| errResponseFormatted("Error deleting data", &e.to_string()))?;
        self
          .logAction(table, "delete", &json!({}), original.as_ref())
          .await;
        Ok(successResponse(DataValue::String("".to_string())))
      }
      ProviderType::Mongo => {
        let mongodb = self
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("MongoDB unavailable"))?;
        self.handleMongoCascade(mongodb, table, id, false).await?;
        mongodb
          .delete(table, id)
          .await
          .map_err(|e| errResponseFormatted("Error deleting data", &e.to_string()))?;
        Ok(successResponse(DataValue::String("".to_string())))
      }
    }
  }

  async fn updateAll(
    &self,
    table: &str,
    data: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;
    let items = data
      .as_array()
      .ok_or_else(|| errResponse("Data must be an array"))?;
    let mut results = Vec::new();

    for item in items {
      let mut itemData = item.clone();
      itemData = validateModel(table, &itemData, false).map_err(|e| errResponse(&e))?;

      match providerType {
        ProviderType::Json => {
          if let Some(id) = itemData.get("id").and_then(|v| v.as_str()) {
            self
              .jsonProvider
              .update(table, id, itemData.clone())
              .await
              .map_err(|e| errResponseFormatted("Bulk update error", &e.to_string()))?;
            results.push(itemData);
          }
        }
        ProviderType::Mongo => results.push(itemData),
      }
    }
    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "".to_string(),
      data: DataValue::Array(results),
    })
  }
}
