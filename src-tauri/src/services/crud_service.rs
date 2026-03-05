use crate::helpers::common::getProviderType;
use crate::models::{
  provider_type_model::ProviderType,
  relation_obj::RelationObj,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
};
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};
use mongodb::bson::{doc, to_bson, Document};
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct CrudService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl CrudService {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
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
    // Validate table name (whitelist)
    let allowedTables = [
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "profiles",
      "daily_activities",
      "users",
    ];
    if !allowedTables.contains(&table.as_str()) {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Invalid table name: {}", table),
        data: DataValue::String("".to_string()),
      });
    }

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
          .get(&table, filter.unwrap_or(json!({})), relations, syncMeta)
          .await
      }
      "create" => {
        let data = data.ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "Data required for create operation".to_string(),
          data: DataValue::String("".to_string()),
        })?;
        self.create(&table, data, syncMeta).await
      }
      "update" => {
        let id = id.ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "ID required for update operation".to_string(),
          data: DataValue::String("".to_string()),
        })?;
        let data = data.ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "Data required for update operation".to_string(),
          data: DataValue::String("".to_string()),
        })?;
        self.update(&table, &id, data, syncMeta).await
      }
      "delete" => {
        let id = id.ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "ID required for delete operation".to_string(),
          data: DataValue::String("".to_string()),
        })?;
        self.delete(&table, &id, syncMeta).await
      }
      _ => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!(
          "Invalid operation: {}. Use: getAll, read, create, update, delete",
          operation
        ),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  async fn getAll(
    &self,
    table: &str,
    filter: Value,
    relations: Option<Vec<RelationObj>>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;

    match providerType {
      ProviderType::Json => {
        let result = self
          .jsonProvider
          .getAll(table, Some(filter), relations)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(result),
        })
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let docFilter = if let Some(obj) = filter.as_object() {
          let mut doc = Document::new();
          for (k, v) in obj {
            doc.insert(k, to_bson(v).unwrap_or(mongodb::bson::Bson::Null));
          }
          Some(doc)
        } else {
          Some(doc! {})
        };

        let result = mongodb
          .getAll(table, docFilter, relations)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        // Convert documents to JSON values
        let values: Vec<Value> = result
          .into_iter()
          .map(|doc| serde_json::to_value(doc).unwrap())
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
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;

    match providerType {
      ProviderType::Json => {
        let result = self
          .jsonProvider
          .get(table, Some(filter), relations, "")
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(result),
        })
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let docFilter = if let Some(obj) = filter.as_object() {
          let mut doc = Document::new();
          for (k, v) in obj {
            doc.insert(k, to_bson(v).unwrap_or(mongodb::bson::Bson::Null));
          }
          Some(doc)
        } else {
          None
        };

        let result = mongodb
          .get(table, docFilter, relations, "")
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        let value = serde_json::to_value(result).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting result: {}", e),
          data: DataValue::String("".to_string()),
        })?;

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
    data: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;

    match providerType {
      ProviderType::Json => {
        let success = self
          .jsonProvider
          .create(table, data)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        if success {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Record created successfully".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to create record".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let doc = mongodb::bson::to_document(&data).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting to document: {}", e),
          data: DataValue::String("".to_string()),
        })?;

        let success = mongodb
          .create(table, doc)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        if success {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Record created successfully".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to create record".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
    }
  }

  async fn update(
    &self,
    table: &str,
    id: &str,
    data: Value,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;

    match providerType {
      ProviderType::Json => {
        let success = self
          .jsonProvider
          .update(table, id, data)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error updating data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        if success {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Record updated successfully".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to update record".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let doc = mongodb::bson::to_document(&data).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting to document: {}", e),
          data: DataValue::String("".to_string()),
        })?;

        let success = mongodb
          .update(table, id, doc)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error updating data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        if success {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Record updated successfully".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to update record".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
    }
  }

  async fn delete(
    &self,
    table: &str,
    id: &str,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;

    match providerType {
      ProviderType::Json => {
        let success = self
          .jsonProvider
          .delete(table, id)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error deleting data: {}", e),
            data: DataValue::String("".to_string()),
          })?;

        if success {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Record deleted successfully".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to delete record".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        })?;

        let success = mongodb.delete(table, id).await.map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error deleting data: {}", e),
          data: DataValue::String("".to_string()),
        })?;

        if success {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "Record deleted successfully".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Err(ResponseModel {
            status: ResponseStatus::Error,
            message: "Failed to delete record".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
    }
  }
}
