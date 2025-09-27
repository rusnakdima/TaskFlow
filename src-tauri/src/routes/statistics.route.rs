/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn statisticsGet(
  state: State<'_, AppState>,
  userId: String,
  timeRange: String,
) -> Result<ResponseModel, ResponseModel> {
  let statisticsController = state.statisticsController.clone();
  let result = statisticsController.getStatistics(userId, timeRange).await;
  result
}
