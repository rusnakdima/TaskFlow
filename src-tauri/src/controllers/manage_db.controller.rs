/* helpers */
use crate::helpers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::response_model::ResponseModel;

/* services */
use crate::services::manage_db_service::ManageDbService;

#[allow(non_snake_case)]
pub struct ManageDbController {
  pub managedbService: ManageDbService,
}

impl ManageDbController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<std::sync::Arc<MongodbProvider>>,
  ) -> Self {
    Self {
      managedbService: ManageDbService::new(jsonProvider, mongodbProvider),
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

  #[allow(non_snake_case)]
  pub async fn getAllDataForAdmin(&self) -> Result<ResponseModel, ResponseModel> {
    return self.managedbService.getAllDataForAdmin().await;
  }

  #[allow(non_snake_case)]
  pub async fn permanentlyDeleteRecord(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self
      .managedbService
      .permanentlyDeleteRecord(table, id)
      .await;
  }
}
