/* sys lib */
use serde_json::Value;

/* providers */
use crate::providers::base_crud::CrudProvider;

/* errors */
use crate::errors::ApiResult;

/* models */
use crate::models::table_model::validateModel;

/// BaseRepository - Generic repository with automatic model validation
/// Currently unused but kept for future refactoring opportunities
#[allow(dead_code)]
pub struct BaseRepository<P: CrudProvider> {
  pub provider: P,
  pub tableName: String,
}

#[allow(dead_code)]
impl<P: CrudProvider> BaseRepository<P> {
  pub fn new(provider: P, tableName: String) -> Self {
    Self {
      provider,
      tableName,
    }
  }

  pub async fn getAll(&self, filter: Option<Value>) -> ApiResult<Vec<Value>> {
    self.provider.getAll(&self.tableName, filter).await
  }

  pub async fn get(&self, id: &str) -> ApiResult<Value> {
    self.provider.get(&self.tableName, id).await
  }

  pub async fn create(&self, mut data: Value) -> ApiResult<Value> {
    // Apply timestamps
    if let Some(obj) = data.as_object_mut() {
      let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
      if !obj.contains_key("createdAt") {
        obj.insert("createdAt".to_string(), Value::String(timestamp.clone()));
      }
      obj.insert("updatedAt".to_string(), Value::String(timestamp));
    }

    // Validate
    let validated = validateModel(&self.tableName, &data, true)
      .map_err(|e| crate::errors::ApiError::Validation(e))?;

    self
      .provider
      .create(&self.tableName, validated.clone())
      .await?;
    Ok(validated)
  }

  pub async fn update(&self, id: &str, mut data: Value) -> ApiResult<Value> {
    // Apply timestamps
    if let Some(obj) = data.as_object_mut() {
      let timestamp = crate::helpers::timestamp_helper::getCurrentTimestamp();
      obj.insert("updatedAt".to_string(), Value::String(timestamp));
    }

    // Validate
    let validated = validateModel(&self.tableName, &data, false)
      .map_err(|e| crate::errors::ApiError::Validation(e))?;

    self
      .provider
      .update(&self.tableName, id, validated.clone())
      .await?;
    Ok(validated)
  }

  pub async fn delete(&self, id: &str) -> ApiResult<bool> {
    self.provider.delete(&self.tableName, id).await
  }
}
