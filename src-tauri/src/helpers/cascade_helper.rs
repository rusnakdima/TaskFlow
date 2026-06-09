use crate::entities::response_entity::ResponseModel;
use crate::providers::data_provider::DataProvider;
use nosql_orm::CascadeManager;

pub async fn soft_delete_cascade_all(
  provider: &DataProvider,
  table: &str,
  id: &str,
) -> Result<(), ResponseModel> {
  match provider {
    DataProvider::Json(p) => {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete(table, id).await;
    }
    DataProvider::Mongo(p) => {
      let cascade = CascadeManager::new(p.as_ref().clone());
      let _ = cascade.soft_delete(table, id).await;
    }
    DataProvider::Both(json, mongo) => {
      let cascade_json = CascadeManager::new(json.as_ref().clone());
      let cascade_mongo = CascadeManager::new(mongo.as_ref().clone());
      let _ = cascade_json.soft_delete(table, id).await;
      let _ = cascade_mongo.soft_delete(table, id).await;
    }
  }
  Ok(())
}
