/* helpers */
use crate::helpers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::ResponseModel;

/* services */
use crate::services::manage_db_service;

#[allow(non_snake_case)]
pub struct ManageDbController {
  pub managedbService: manage_db_service::ManageDbService,
}

impl ManageDbController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<std::sync::Arc<MongodbProvider>>) -> Self {
    Self {
      managedbService: manage_db_service::ManageDbService::new(jsonProvider, mongodbProvider),
    }
  }

  #[allow(non_snake_case)]
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.importToLocal(userId).await;
  }

  #[allow(non_snake_case)]
  pub async fn exportToCloud(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.exportToCloud(userId).await;
  }
}
