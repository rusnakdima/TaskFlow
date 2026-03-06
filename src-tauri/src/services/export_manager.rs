/* sys */
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

  /// Export data from local to cloud
  pub async fn export_to_cloud(&self, user_id: String) -> Result<ResponseModel, ResponseModel> {
    let mongodb_provider = self.mongodbProvider.as_ref().ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: "MongoDB not available".to_string(),
      data: DataValue::String("".to_string()),
    })?;

    match mongodb_provider.exportToCloud(user_id, &self.jsonProvider).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "Data exported to cloud MongoDB successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error exporting data: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
