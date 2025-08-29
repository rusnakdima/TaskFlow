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
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: MongodbProvider) -> Self {
    Self {
      managedbService: manage_db_service::ManageDbService::new(jsonProvider, mongodbProvider),
    }
  }

  #[allow(non_snake_case)]
  pub async fn importToJsonDb(&self) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.importToJsonDb().await;
  }

  #[allow(non_snake_case)]
  pub async fn exportFromJsonDb(&self) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.exportFromJsonDb().await;
  }

  #[allow(non_snake_case)]
  pub async fn importToMongoDb(&self) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.importToMongoDb().await;
  }

  #[allow(non_snake_case)]
  pub async fn exportFromMongoDb(&self) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.exportFromMongoDb().await;
  }
}
