/* sys lib */
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::statistics_service::StatisticsService;

/* models */
use crate::models::{response_model::ResponseModel, sync_metadata_model::SyncMetadata};

#[allow(non_snake_case)]
pub struct StatisticsController {
  pub statisticsService: StatisticsService,
}

impl StatisticsController {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      statisticsService: StatisticsService::new(jsonProvider, mongodbProvider, activityLogHelper),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getStatistics(
    &self,
    userId: String,
    timeRange: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    self
      .statisticsService
      .getStatistics(userId, timeRange, syncMetadata)
      .await
  }
}
