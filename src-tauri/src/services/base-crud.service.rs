use crate::models::response::ResponseModel;
use crate::repositories::data_provider::DataProvider;
use tauri_shared::response::Response;
pub struct BaseCrudService {
  json_provider: DataProvider,
  mongo_provider: Option<DataProvider>,
}
impl BaseCrudService {
  pub fn new(json_provider: DataProvider, mongo_provider: Option<DataProvider>) -> Self {
    Self {
      json_provider,
      mongo_provider,
    }
  }
  pub fn get_provider(&self, visibility: &str) -> Result<DataProvider, ResponseModel> {
    let offline = std::env::var("OFFLINE_MODE").unwrap_or_default() == "true";
    let use_json = visibility == "private" || offline || visibility == "all";
    if use_json {
      Ok(self.json_provider.clone())
    } else {
      match self.mongo_provider.clone() {
        Some(p) => Ok(p),
        None => Err(Response::error(
          "MongoDB not available - cannot access shared/team records. Please connect to the internet or change visibility to private.",
        )),
      }
    }
  }
  pub fn get_json_provider(&self) -> &DataProvider {
    &self.json_provider
  }
  #[allow(dead_code)]
  pub fn get_mongo_provider(&self) -> Option<&DataProvider> {
    self.mongo_provider.as_ref()
  }
}
