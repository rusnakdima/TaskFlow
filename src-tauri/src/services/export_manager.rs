/* sys */
use chrono::Utc;
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::Value;
use std::sync::Arc;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/// ExportManager - Handles exporting data from local JSON to cloud MongoDB
pub struct ExportManager {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl ExportManager {
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

  /// Export data from local to cloud
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongodb_provider = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: "MongoDB not available".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    // First, handle deleted records
    let mut deleted_by_table: std::collections::HashMap<String, Vec<Document>> =
      std::collections::HashMap::new();

    for table in &tables {
      let all_local = match self.jsonProvider.getDataTable(table).await {
        Ok(recs) => recs,
        Err(_) => continue,
      };

      for record in all_local {
        if record.get("isDeleted").and_then(|v| v.as_bool()) == Some(true) {
          if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
            let doc: Document = from_bson(to_bson(&record).map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting record to bson: {}", e),
              data: DataValue::String("".to_string()),
            })?)
            .map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting bson to document: {}", e),
              data: DataValue::String("".to_string()),
            })?;

            deleted_by_table
              .entry(table.to_string())
              .or_insert(Vec::new())
              .push(doc);

            let _ = self.jsonProvider.hardDelete(table, &id).await;
          }
        }
      }
    }

    // Update deleted records in cloud
    for (table, docs) in deleted_by_table {
      if let Err(e) = mongodb_provider.updateAll(&table, docs).await {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error updating deleted records in {}: {}", table, e),
          data: DataValue::String("".to_string()),
        });
      }
    }

    // Get local and cloud data for comparison
    let local_data = self.get_all_from_local(user_id.clone()).await?;
    let cloud_data = self.get_all_from_cloud(user_id.clone()).await?;

    let mut all_to_upsert: std::collections::HashMap<String, Vec<Document>> =
      std::collections::HashMap::new();

    for table in &tables {
      let local = local_data.get(*table).cloned().unwrap_or(vec![]);
      let cloud = cloud_data.get(*table).cloned().unwrap_or(vec![]);

      let mut local_map: std::collections::HashMap<String, Value> =
        std::collections::HashMap::new();
      for v in &local {
        if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
          local_map.insert(id.to_string(), v.clone());
        }
      }

      let mut cloud_map: std::collections::HashMap<String, Document> =
        std::collections::HashMap::new();
      for d in &cloud {
        if let Some(id) = d.get_str("id").ok() {
          cloud_map.insert(id.to_string(), d.clone());
        }
      }

      let mut to_upsert = vec![];

      // Update changed records from local to cloud
      for (id, local_val) in &local_map {
        let needs_update = if let Some(cloud_doc) = cloud_map.get(id) {
          let cloud_val = serde_json::to_value(cloud_doc).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error converting cloud doc to value: {}", e),
            data: DataValue::String("".to_string()),
          })?;
          Self::should_update_target(local_val, &cloud_val)
        } else {
          true
        };

        if needs_update {
          let doc: Document = from_bson(to_bson(local_val).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error converting local val to bson: {}", e),
            data: DataValue::String("".to_string()),
          })?)
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error converting bson to document: {}", e),
            data: DataValue::String("".to_string()),
          })?;
          to_upsert.push(doc);
        }
      }

      // Handle records deleted in local but exist in cloud
      for (id, mut cloud_doc) in cloud_map {
        if !local_map.contains_key(&id) {
          let is_deleted_in_cloud = cloud_doc.get_bool("isDeleted").unwrap_or(false);
          if is_deleted_in_cloud {
            let now = chrono::Utc::now();
            let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            cloud_doc.insert("isDeleted", true);
            cloud_doc.insert("updatedAt", formatted);
            to_upsert.push(cloud_doc);
          }
        }
      }

      all_to_upsert.insert(table.to_string(), to_upsert);
    }

    // Upsert all records to cloud
    for (table, docs) in all_to_upsert {
      if !docs.is_empty() {
        if let Err(e) = mongodb_provider.updateAll(&table, docs).await {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error upserting records in {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    }

    // Clean deleted records from local
    let _ = self.clean_deleted_records_from_local().await;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Data exported to cloud MongoDB successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  /// Get all data from local (helper method)
  async fn get_all_from_local(
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

  /// Get all data from cloud (helper method)
  async fn get_all_from_cloud(
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

  /// Clean deleted records from local (helper method)
  async fn clean_deleted_records_from_local(&self) -> Result<(), ResponseModel> {
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
