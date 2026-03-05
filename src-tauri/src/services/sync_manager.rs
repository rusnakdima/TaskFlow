/* sys */
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/// SyncManager - Handles data synchronization between MongoDB and JSON
pub struct SyncManager {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl SyncManager {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  fn should_update_target(source: &Value, target: &Value) -> bool {
    let source_ts = source.get("updatedAt").and_then(|v| v.as_str());
    let target_ts = target.get("updatedAt").and_then(|v| v.as_str());
    match (source_ts, target_ts) {
      (Some(s), Some(t)) => s > t,
      _ => true,
    }
  }

  /// Get all data from cloud (MongoDB)
  pub async fn get_all_from_cloud(
    &self,
    user_id: String,
  ) -> Result<std::collections::HashMap<String, Vec<Document>>, ResponseModel> {
    let mongodb_provider = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: "MongoDB not available".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    let mut result = std::collections::HashMap::new();
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    for table in tables {
      let filter = match table {
        "todos" => doc! {"userId": &user_id, "isDeleted": {"$ne": true}},
        "tasks" => {
          let todo_ids: Vec<String> = result
            .get("todos")
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v: &Document| v.get_str("id").ok().map(|s| s.to_string()))
            .collect();
          if todo_ids.is_empty() {
            continue;
          }
          doc! {"todoId": {"$in": &todo_ids}, "isDeleted": {"$ne": true}}
        }
        "subtasks" => {
          let task_ids: Vec<String> = result
            .get("tasks")
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v: &Document| v.get_str("id").ok().map(|s| s.to_string()))
            .collect();
          if task_ids.is_empty() {
            continue;
          }
          doc! {"taskId": {"$in": &task_ids}, "isDeleted": {"$ne": true}}
        }
        "categories" | "daily_activities" => {
          doc! {"userId": &user_id, "isDeleted": {"$ne": true}}
        }
        _ => continue,
      };

      match mongodb_provider.getAll(table, Some(filter), None).await {
        Ok(docs) => {
          result.insert(table.to_string(), docs);
        }
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    }

    Ok(result)
  }

  /// Get all data from local (JSON)
  pub async fn get_all_from_local(
    &self,
    user_id: String,
  ) -> Result<std::collections::HashMap<String, Vec<Value>>, ResponseModel> {
    let mut result = std::collections::HashMap::new();
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    for table in tables {
      let filter = match table {
        "todos" => serde_json::json!({"userId": user_id.clone()}),
        "tasks" => {
          let todo_ids: Vec<String> = result
            .get("todos")
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v: &Value| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
            .collect();
          serde_json::json!({"todoId": todo_ids})
        }
        "subtasks" => {
          let task_ids: Vec<String> = result
            .get("tasks")
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v: &Value| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
            .collect();
          serde_json::json!({"taskId": task_ids})
        }
        "categories" | "daily_activities" => {
          serde_json::json!({"userId": user_id.clone()})
        }
        _ => continue,
      };

      match self.jsonProvider.getAll(table, Some(filter), None).await {
        Ok(vals) => {
          result.insert(table.to_string(), vals);
        }
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting {} from JSON: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    }

    Ok(result)
  }

  /// Import data from cloud to local
  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let cloud_data = self.get_all_from_cloud(user_id.clone()).await?;
    let local_data = self.get_all_from_local(user_id.clone()).await?;

    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];
    let mut all_to_upsert: std::collections::HashMap<String, Vec<Value>> =
      std::collections::HashMap::new();

    for table in &tables {
      let cloud = cloud_data.get(*table).cloned().unwrap_or(vec![]);
      let local = local_data.get(*table).cloned().unwrap_or(vec![]);

      let mut cloud_map: std::collections::HashMap<String, Value> =
        std::collections::HashMap::new();
      for doc in &cloud {
        let value = serde_json::to_value(doc).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting cloud doc to value: {}", e),
          data: DataValue::String("".to_string()),
        })?;
        if let Some(id) = value.get("id").and_then(|i| i.as_str()) {
          cloud_map.insert(id.to_string(), value);
        }
      }

      let mut local_map: std::collections::HashMap<String, Value> =
        std::collections::HashMap::new();
      for v in &local {
        if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
          local_map.insert(id.to_string(), v.clone());
        }
      }

      let mut to_upsert = vec![];
      for (id, cloud_val) in &cloud_map {
        let needs_update = if let Some(local_val) = local_map.get(id) {
          Self::should_update_target(cloud_val, local_val)
        } else {
          true
        };

        if needs_update {
          to_upsert.push(cloud_val.clone());
        }
      }

      all_to_upsert.insert(table.to_string(), to_upsert);
    }

    for (table, values) in all_to_upsert {
      if !values.is_empty() {
        if let Err(e) = self.jsonProvider.updateAll(&table, values).await {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error upserting records in {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Data imported to local JSON DB successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  /// Clean deleted records from local
  pub async fn clean_deleted_records_from_local(&self) -> Result<(), ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    for table in &tables {
      let all_records = match self.jsonProvider.getDataTable(table).await {
        Ok(recs) => recs,
        Err(_) => continue,
      };

      for record in all_records {
        if record.get("isDeleted").and_then(|v| v.as_bool()) == Some(true) {
          if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
            let _ = self.jsonProvider.hardDelete(table, id).await;
          }
        }
      }
    }

    Ok(())
  }
}
