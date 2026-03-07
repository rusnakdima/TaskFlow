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
        if let Ok(todo) = self.jsonProvider.get("todos", None, None, todoId).await {
          return todo
            .get("userId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        }
      }
    }

    if table == "subtasks" {
      if let Some(taskId) = data.get("taskId").and_then(|v| v.as_str()) {
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

  /// Perform cascade operations for JSON provider
  fn handleJsonCascade<'a>(
    &'a self,
    table: &'a str,
    id: &'a str,
    isRestore: bool,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      let timestamp = Self::getCurrentTimestamp();
      let updates = json!({ "isDeleted": !isRestore, "updatedAt": timestamp });

      if table == "todos" {
        let tasks = self
          .jsonProvider
          .getAll("tasks", Some(json!({"todoId": id})), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for task in tasks {
          if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
            self.handleJsonCascade("tasks", taskId, isRestore).await?;
            let _ = self
              .jsonProvider
              .update("tasks", taskId, updates.clone())
              .await;
          }
        }
      } else if table == "tasks" {
        let subtasks = self
          .jsonProvider
          .getAll("subtasks", Some(json!({"taskId": id})), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for subtask in subtasks {
          if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
            let _ = self
              .jsonProvider
              .update("subtasks", subtaskId, updates.clone())
              .await;
          }
        }
      }
      Ok(())
    }
    .boxed()
  }

  /// Perform cascade operations for MongoDB provider
  fn handleMongoCascade<'a>(
    &'a self,
    mongodb: &'a Arc<MongodbProvider>,
    table: &'a str,
    id: &'a str,
    isRestore: bool,
  ) -> BoxFuture<'a, Result<(), ResponseModel>> {
    async move {
      let timestamp = Self::getCurrentTimestamp();
      let updateDoc = mongodb::bson::doc! { "isDeleted": !isRestore, "updatedAt": timestamp };

      if table == "todos" {
        let tasks = mongodb
          .getAll("tasks", Some(mongodb::bson::doc! { "todoId": id }), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for task in tasks {
          if let Ok(taskId) = task.get_str("id") {
            self
              .handleMongoCascade(mongodb, "tasks", taskId, isRestore)
              .await?;
            let _ = mongodb.update("tasks", taskId, updateDoc.clone()).await;
          }
        }
      } else if table == "tasks" {
        let subtasks = mongodb
          .getAll("subtasks", Some(mongodb::bson::doc! { "taskId": id }), None)
          .await
          .map_err(|e| errResponseFormatted("Cascade failed", &e.to_string()))?;

        for subtask in subtasks {
          if let Ok(subtaskId) = subtask.get_str("id") {
            let _ = mongodb
              .update("subtasks", subtaskId, updateDoc.clone())
              .await;
          }
        }
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
        let doc = mongodb::bson::to_document(&data)
          .map_err(|e| errResponseFormatted("BSON error", &e.to_string()))?;
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
