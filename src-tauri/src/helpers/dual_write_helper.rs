use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::err_response;
use crate::providers::data_provider::DataProvider;
use serde_json::Value;

pub async fn dual_insert(
  mongo:&DataProvider,
  json_provider: &DataProvider,
  table: &str,
  data: Value,
) -> Result<Value, ResponseModel> {
  let doc = mongo
    .insert(table, data)
    .await
    .map_err(|e| err_response(&format!("MongoDB insert failed: {}", e)))?;
  if let DataProvider::Json(p) = json_provider {
    let _ = p.insert(table, doc.clone()).await;
  }
  Ok(doc)
}

pub async fn dual_patch(
  mongo: &DataProvider,
  json_provider: &DataProvider,
  table: &str,
  id: &str,
  data: Value,
) -> Result<Value, ResponseModel> {
  let doc = mongo
    .patch(table, id, data.clone())
    .await
    .map_err(|e| err_response(&format!("MongoDB patch failed: {}", e)))?;
  if let DataProvider::Json(p) = json_provider {
    let _ = p.patch(table, id, data).await;
  }
  Ok(doc)
}

pub async fn dual_update(
  mongo: &DataProvider,
  json_provider: &DataProvider,
  table: &str,
  id: &str,
  data: Value,
) -> Result<Value, ResponseModel> {
  let doc = mongo
    .update(table, id, data.clone())
    .await
    .map_err(|e| err_response(&format!("MongoDB update failed: {}", e)))?;
  if let DataProvider::Json(p) = json_provider {
    let _ = p.update(table, id, data).await;
  }
  Ok(doc)
}