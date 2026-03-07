/* sys */
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

  /// Import data from cloud to local
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: "MongoDB not available".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    match mongodbProvider
      .importToLocal(userId, &self.jsonProvider)
      .await
    {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Data imported to local JSON DB successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error importing data: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Clean deleted records from local
  pub async fn cleanDeletedRecordsFromLocal(&self) -> Result<(), ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    for table in &tables {
      let allRecords = match self.jsonProvider.getDataTable(table).await {
        Ok(recs) => recs,
        Err(_) => continue,
      };

      for record in allRecords {
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
