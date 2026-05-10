use crate::entities::response_entity::ResponseModel;
use crate::services::cascade::{CascadeResult, CascadeService, CountService};
use crate::services::entity_resolution_service::EntityResolutionService;
use std::sync::Arc;

#[allow(unused_imports)]
use crate::entities::response_entity::DataValue;

pub struct CascadeDelegate {
  pub cascade_service: CascadeService,
  pub count_service: Arc<CountService>,
  pub entity_resolution: Arc<EntityResolutionService>,
}

impl CascadeDelegate {
  pub fn new(
    cascade_service: CascadeService,
    count_service: Arc<CountService>,
    entity_resolution: Arc<EntityResolutionService>,
  ) -> Self {
    Self {
      cascade_service,
      count_service,
      entity_resolution,
    }
  }

  pub async fn sync_entity_to_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .sync_entity_to_mongo(table, id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn sync_entity_to_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .sync_entity_to_json(table, id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn export_todo_cascade_to_mongo(
    &self,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .export_todo_cascade_to_mongo(id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn import_todo_cascade_to_json(
    &self,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .import_todo_cascade_to_json(id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn permanent_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .permanent_delete_cascade_json(table, id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn permanent_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .permanent_delete_cascade_mongo(table, id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn soft_delete_cascade_json(
    &self,
    table: &str,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .soft_delete_cascade_json(table, id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }

  pub async fn soft_delete_cascade_mongo(
    &self,
    table: &str,
    id: &str,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .cascade_service
      .soft_delete_cascade_mongo(table, id)
      .await
      .map(|result| {
        crate::helpers::response_helper::success_response(
          crate::entities::response_entity::DataValue::Object(
            serde_json::to_value(result).unwrap(),
          ),
        )
      })
  }
}
