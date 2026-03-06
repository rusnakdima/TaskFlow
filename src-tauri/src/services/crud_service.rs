use crate::helpers::bson_helper::valueToDocument;
use crate::helpers::common::getProviderType;
use crate::helpers::response_helper::{errResponse, errResponseFormatted, successResponse};
use crate::models::{
  provider_type_model::ProviderType,
  relation_obj::RelationObj,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
  table_model::{validateTable, validateModel},
};
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};
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
    // Validate table name
    if let Err(e) = validateTable(&table) {
      return Err(errResponse(&e));
    }

    let syncMeta = syncMetadata.unwrap_or(SyncMetadata {
      isOwner: true,
      isPrivate: true,
    });

    match operation.as_str() {
      "getAll" => self.getAll(&table, filter.unwrap_or(json!({})), relations, syncMeta).await,
      "read" | "get" => self.get(&table, filter.unwrap_or(json!({})), relations, syncMeta).await,
      "create" => {
        let mut data = data.ok_or_else(|| errResponse("Data required for create operation"))?;

        // Validate and create model with generated ID
        match validateModel(&table, &data, true) {
          Ok(validatedData) => {
            data = validatedData;
          }
          Err(e) => {
            return Err(errResponse(&e));
          }
        }

        self.create(&table, data, syncMeta).await
      }
      "update" => {
        let id = id.ok_or_else(|| errResponse("ID required for update operation"))?;
        let mut data = data.ok_or_else(|| errResponse("Data required for update operation"))?;

        // Validate update data
        match validateModel(&table, &data, false) {
          Ok(validatedData) => {
            data = validatedData;
          }
          Err(e) => {
            return Err(errResponse(&e));
          }
        }

        self.update(&table, &id, data, syncMeta).await
      }
      "delete" => {
        let id = id.ok_or_else(|| errResponse("ID required for delete operation"))?;
        self.delete(&table, &id, syncMeta).await
      }
      _ => Err(errResponse(&format!(
        "Invalid operation: {}. Use: getAll, read, create, update, delete",
        operation
      ))),
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
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Array(result),
        })
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| errResponse("MongoDB not available"))?;

        let docFilter = valueToDocument(&filter);

        let result = mongodb
          .getAll(table, Some(docFilter), relations)
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;

        // Convert documents to JSON values
        let values: Vec<Value> = result
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
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = getProviderType(&syncMetadata)?;

    match providerType {
      ProviderType::Json => {
        let result = self
          .jsonProvider
          .get(table, Some(filter), relations, "")
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;

        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: DataValue::Object(result),
        })
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| errResponse("MongoDB not available"))?;

        let docFilter = if filter.is_object() {
          Some(valueToDocument(&filter))
        } else {
          None
        };

        let result = mongodb
          .get(table, docFilter, relations, "")
          .await
          .map_err(|e| errResponseFormatted("Error getting data", &e.to_string()))?;

        let value = serde_json::to_value(result).map_err(|e| {
          errResponseFormatted("Error converting result", &e.to_string())
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
        let result = self
          .jsonProvider
          .create(table, data.clone())
          .await
          .map_err(|e| errResponseFormatted("Error creating data", &e.to_string()))?;

        if result {
          Ok(successResponse(DataValue::Object(data.clone())))
        } else {
          Err(errResponse("Failed to create record"))
        }
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| errResponse("MongoDB not available"))?;

        let doc = mongodb::bson::to_document(&data).map_err(|e| {
          errResponseFormatted("Error converting to document", &e.to_string())
        })?;

        let result = mongodb
          .create(table, doc)
          .await
          .map_err(|e| errResponseFormatted("Error creating data", &e.to_string()))?;

        if result {
          Ok(successResponse(DataValue::Object(data.clone())))
        } else {
          Err(errResponse("Failed to create record"))
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
        let result = self
          .jsonProvider
          .update(table, id, data.clone())
          .await
          .map_err(|e| errResponseFormatted("Error updating data", &e.to_string()))?;

        if result {
          Ok(successResponse(DataValue::Object(data.clone())))
        } else {
          Err(errResponse("Failed to update record"))
        }
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| errResponse("MongoDB not available"))?;

        let doc = mongodb::bson::to_document(&data).map_err(|e| {
          errResponseFormatted("Error converting to document", &e.to_string())
        })?;

        let result = mongodb
          .update(table, id, doc)
          .await
          .map_err(|e| errResponseFormatted("Error updating data", &e.to_string()))?;

        if result {
          Ok(successResponse(DataValue::Object(data.clone())))
        } else {
          Err(errResponse("Failed to update record"))
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
        let result = self
          .jsonProvider
          .delete(table, id)
          .await
          .map_err(|e| errResponseFormatted("Error deleting data", &e.to_string()))?;

        if result {
          Ok(successResponse(DataValue::String("".to_string())))
        } else {
          Err(errResponse("Failed to delete record"))
        }
      }
      ProviderType::Mongo => {
        let mongodb = self.mongodbProvider.as_ref().ok_or_else(|| errResponse("MongoDB not available"))?;

        let result = mongodb
          .delete(table, id)
          .await
          .map_err(|e| errResponseFormatted("Error deleting data", &e.to_string()))?;

        if result {
          Ok(successResponse(DataValue::String("".to_string())))
        } else {
          Err(errResponse("Failed to delete record"))
        }
      }
    }
  }
}
