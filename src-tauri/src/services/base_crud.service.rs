use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::err_response;
use crate::providers::data_provider::DataProvider;
use nosql_orm::cascade::CascadeManager;

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
        None => Err(err_response(
          "MongoDB not available - cannot access shared/team records. Please connect to the internet or change visibility to private.",
        )),
      }
    }
  }

  #[allow(dead_code)]
  pub fn require_mongo(&self) -> Result<&DataProvider, ResponseModel> {
    self
      .get_mongo_provider()
      .ok_or_else(|| err_response("MongoDB not available"))
  }

  #[allow(dead_code)]
  pub fn parse_filter(
    filter: &serde_json::Value,
  ) -> Result<Option<nosql_orm::query::Filter>, ResponseModel> {
    if filter.is_null() {
      return Ok(None);
    }
    if let Some(obj) = filter.as_object() {
      if obj.is_empty() {
        return Ok(None);
      }
    }
    Ok(Some(nosql_orm::query::Filter::from_json(filter).map_err(
      |e| err_response(&format!("Invalid filter: {}", e)),
    )?))
  }

  #[allow(dead_code)]
  pub async fn soft_delete_cascade(&self, table: &str, id: &str) -> Result<(), ResponseModel> {
    let json_provider = self.get_json_provider();
    if let DataProvider::Json(p) = json_provider {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete(table, id).await;
    }

    if let Some(mongo) = self.get_mongo_provider() {
      if let DataProvider::Mongo(p) = mongo {
        let cascade = CascadeManager::new(p.as_ref().clone());
        let _ = cascade.soft_delete(table, id).await;
      }
    }

    Ok(())
  }
}

pub trait BaseCrudServiceTrait {
  fn get_json_provider(&self) -> &DataProvider;
  fn get_mongo_provider(&self) -> Option<&DataProvider>;
}

impl BaseCrudServiceTrait for BaseCrudService {
  fn get_json_provider(&self) -> &DataProvider {
    &self.json_provider
  }

  fn get_mongo_provider(&self) -> Option<&DataProvider> {
    self.mongo_provider.as_ref()
  }
}
