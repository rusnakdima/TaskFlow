use std::sync::Arc;
use std::sync::Mutex;

use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use serde_json::Value;

use crate::entities::response_entity::{ResponseModel, ResponseStatus};
use crate::helpers::response_helper::err_response;

use crate::services::db_backup::DbBackupService;
use crate::services::{admin_manager::AdminManager, cascade::CascadeService};

pub struct ManageDbService {
  pub json_provider: JsonProvider,
  mongodb_provider: Mutex<Option<Arc<MongoProvider>>>,
  admin_manager: Mutex<Option<AdminManager>>,
  db_backup: DbBackupService,
}

impl ManageDbService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    cascade_service: CascadeService,
    mongo_db_uri: String,
    mongo_db_name: String,
  ) -> Self {
    let admin_manager = mongodb_provider
      .clone()
      .map(|mp| AdminManager::new(json_provider.clone(), mp, cascade_service.clone()));

    let db_backup = DbBackupService::new(
      json_provider.clone(),
      mongodb_provider.clone(),
      mongo_db_uri,
      mongo_db_name,
    );

    Self {
      json_provider,
      mongodb_provider: Mutex::new(mongodb_provider),
      admin_manager: Mutex::new(admin_manager),
      db_backup,
    }
  }

  pub async fn get_all_data_for_admin(&self) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => manager.get_all_data_for_admin().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub async fn get_admin_data_paginated(
    &self,
    data_type: String,
    skip: u64,
    limit: u64,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .lock()
      .unwrap()
      .clone()
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      })?;

    let docs = mongo
      .find_many(&data_type, None, Some(skip), Some(limit), None, true)
      .await
      .map_err(|e| ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error getting paginated {} data: {}", data_type, e),
        data: serde_json::Value::String("".to_string()),
      })?;

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Retrieved {} {} records", docs.len(), data_type),
      data: crate::helpers::common::convert_data_to_object(&docs),
    })
  }

  pub async fn get_all_data_for_archive(&self) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => manager.get_all_data_for_archive().await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub async fn get_archive_data_paginated(
    &self,
    data_type: String,
    skip: u64,
    limit: u64,
  ) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => {
        manager
          .get_archive_data_paginated(data_type, skip, limit)
          .await
      }
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub async fn permanently_delete_record(
    &self,
    table: String,
    id: String,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => {
        manager
          .permanently_delete_record(table, id, visibility)
          .await
      }
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub async fn permanently_delete_record_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => manager.permanently_delete_record_local(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub async fn toggle_delete_status(
    &self,
    table: String,
    id: String,
    visibility: Option<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => manager.toggle_delete_status(table, id, visibility).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub async fn toggle_delete_status_local(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let manager = match self.admin_manager.lock() {
      Ok(guard) => guard.clone(),
      Err(_) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "Lock poisoned".to_string(),
          data: serde_json::Value::String("".to_string()),
        })
      }
    };
    match manager {
      Some(manager) => manager.toggle_delete_status_local(table, id).await,
      None => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      }),
    }
  }

  pub fn get_mongodb_provider(&self) -> Option<Arc<MongoProvider>> {
    self
      .mongodb_provider
      .lock()
      .ok()
      .and_then(|guard| guard.clone())
  }

  pub async fn get_tasks_by_month(
    &self,
    year: i32,
    month: i32,
    offline: bool,
    visibility: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    let start_of_month = format!("{:04}-{:02}-01", year, month);
    let end_of_month = if month == 12 {
      format!("{:04}-01-01", year + 1)
    } else {
      format!("{:04}-{:02}-01", year, month + 1)
    };

    let filter = nosql_orm::query::Filter::from_json(&serde_json::json!({
        "$or": [
            { "start_date": { "$gte": &start_of_month, "$lt": &end_of_month } },
            { "end_date": { "$gte": &start_of_month, "$lt": &end_of_month } },
            { "start_date": { "$lte": &start_of_month }, "end_date": { "$gte": &end_of_month } }
        ]
    }))
    .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

    let mut all_tasks: Vec<Value> = Vec::new();

    if !offline {
      let mongo_option = match self.mongodb_provider.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => None,
      };
      if let Some(mongo) = mongo_option {
        if let Ok(tasks) = mongo
          .find_many("tasks", Some(&filter), None, None, None, true)
          .await
        {
          all_tasks.extend(tasks)
        }
      }
    }

    if visibility == "private" {
      if let Ok(tasks) = self
        .json_provider
        .find_many("tasks", Some(&filter), None, None, None, true)
        .await
      {
        all_tasks.extend(tasks)
      }
    }

    let result_map = serde_json::json!({ "tasks": all_tasks });
    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!(
        "Retrieved {} tasks for {}-{:02}",
        all_tasks.len(),
        year,
        month
      ),
      data: crate::helpers::common::convert_data_to_object(&result_map),
    })
  }

  pub async fn import_to_local(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    self.db_backup.import_to_local(user_id).await
  }

  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    self.db_backup.export_to_cloud(user_id).await
  }

  pub async fn check_mongodb_connection_async(&self) -> bool {
    self.db_backup.check_mongodb_connection_async().await
  }

  pub async fn upsert_to_json(
    &self,
    table: String,
    data: Value,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let result = self.db_backup.upsert_to_json(&table, data).await;
    Ok(ResponseModel {
      status: if result {
        ResponseStatus::Success
      } else {
        ResponseStatus::Error
      },
      message: if result {
        format!("Upserted {} to {}", id, table)
      } else {
        format!("Failed to upsert {} to {}", id, table)
      },
      data: serde_json::Value::String(id),
    })
  }

  pub async fn upsert_to_mongo(
    &self,
    table: String,
    data: Value,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .lock()
      .unwrap()
      .clone()
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      })?;

    let result = self.db_backup.upsert_to_mongo(&mongo, &table, data).await;
    Ok(ResponseModel {
      status: if result {
        ResponseStatus::Success
      } else {
        ResponseStatus::Error
      },
      message: if result {
        format!("Upserted {} to MongoDB {}", id, table)
      } else {
        format!("Failed to upsert {} to MongoDB {}", id, table)
      },
      data: serde_json::Value::String(id),
    })
  }

  pub async fn batch_upsert_to_mongo(
    &self,
    records: Value,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongo = self
      .mongodb_provider
      .lock()
      .unwrap()
      .clone()
      .ok_or_else(|| ResponseModel {
        status: ResponseStatus::Error,
        message: "MongoDB not available".to_string(),
        data: serde_json::Value::String("".to_string()),
      })?;

    let mut total_count = 0;
    let mut success_count = 0;

    if let Some(obj) = records.as_object() {
      for (table, items) in obj {
        if let Some(arr) = items.as_array() {
          for item in arr {
            total_count += 1;
            if self
              .db_backup
              .upsert_to_mongo(&mongo, table, item.clone())
              .await
            {
              success_count += 1;
            }
          }
        }
      }
    }

    Ok(ResponseModel {
      status: if success_count == total_count {
        ResponseStatus::Success
      } else {
        ResponseStatus::Error
      },
      message: format!(
        "Batch upserted {}/{} records to MongoDB",
        success_count, total_count
      ),
      data: serde_json::json!({
        "total": total_count,
        "success": success_count
      }),
    })
  }

  pub async fn delete_from_json(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let result = self.json_provider.delete(&table, &id).await.is_ok();
    Ok(ResponseModel {
      status: if result {
        ResponseStatus::Success
      } else {
        ResponseStatus::Error
      },
      message: if result {
        format!("Deleted {} from {}", id, table)
      } else {
        format!("Failed to delete {} from {}", id, table)
      },
      data: serde_json::Value::String(id),
    })
  }

  pub async fn batch_soft_delete_json(
    &self,
    table: String,
    ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut success_count = 0;
    let now = serde_json::json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });
    for id in &ids {
      if self
        .json_provider
        .update(&table, id, now.clone())
        .await
        .is_ok()
      {
        success_count += 1;
      }
    }
    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Soft deleted {} records from {}", success_count, table),
      data: serde_json::json!({ "count": success_count }),
    })
  }

  pub async fn batch_restore_json(
    &self,
    table: String,
    ids: Vec<String>,
  ) -> Result<ResponseModel, ResponseModel> {
    let mut success_count = 0;
    let now = serde_json::json!({ "deleted_at": serde_json::Value::Null });
    for id in &ids {
      if self
        .json_provider
        .update(&table, id, now.clone())
        .await
        .is_ok()
      {
        success_count += 1;
      }
    }
    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Restored {} records in {}", success_count, table),
      data: serde_json::json!({ "count": success_count }),
    })
  }

  pub async fn get_all_from_json(
    &self,
    table: String,
    limit: u64,
  ) -> Result<ResponseModel, ResponseModel> {
    let items = self
      .json_provider
      .find_many(&table, None, None, Some(limit), None, true)
      .await
      .unwrap_or_default();
    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: format!("Retrieved {} {} records", items.len(), table),
      data: crate::helpers::common::convert_data_to_object(&items),
    })
  }

  pub async fn import_private_to_local(
    &self,
    user_id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    self.db_backup.import_to_local(user_id).await
  }
}
