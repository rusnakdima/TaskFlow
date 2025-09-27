/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::statistics_service;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
pub struct StatisticsController {
  pub statisticsService: statistics_service::StatisticsService,
}

impl StatisticsController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      statisticsService: statistics_service::StatisticsService::new(jsonProvider),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getStatistics(
    &self,
    userId: String,
    timeRange: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self
      .statisticsService
      .getStatistics(userId, timeRange)
      .await;
  }
}
