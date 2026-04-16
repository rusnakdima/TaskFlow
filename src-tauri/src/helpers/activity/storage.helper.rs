/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::{to_value, Value};

/* helpers */
use crate::helpers::common::convertDataToArray;

/* providers */
use nosql_orm::providers::JsonProvider;

/* entities */
use crate::entities::{
  daily_activity_entity::{DailyActivityCreateModel, DailyActivityModel, DailyActivityUpdateModel},
  response_entity::{DataValue, ResponseModel, ResponseStatus},
};

#[derive(Clone)]
pub struct ActivityStorage {
  pub jsonProvider: JsonProvider,
}

impl ActivityStorage {
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self { jsonProvider }
  }

  pub async fn getAll(&self, _filter: Value) -> Result<ResponseModel, ResponseModel> {
    let listDailyActivities = self
      .jsonProvider
      .find_all("daily_activities")
      .await;
    match listDailyActivities {
      Ok(dailyActivities) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToArray(&dailyActivities),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!(
          "Couldn't get a list of daily activities! {}",
          error.to_string()
        ),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn getOrCreateDailyActivity(
    &self,
    userId: String,
    date: String,
  ) -> Result<DailyActivityModel, ResponseModel> {
    let existing = self
      .jsonProvider
      .find_all("daily_activities")
      .await;

    if let Ok(activities) = existing {
      if let Some(activityValue) = activities.first() {
        if let Ok(activity) = serde_json::from_value::<DailyActivityModel>(activityValue.clone()) {
          return Ok(activity);
        }
      }
    }

    let createModel = DailyActivityCreateModel {
      userId: userId.clone(),
      date: date.clone(),
    };
    let model: DailyActivityModel = createModel.into();
    let record: Value = to_value(&model).unwrap();

    match self.jsonProvider.insert("daily_activities", record).await {
      Ok(_) => Ok(model),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create daily activity! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn updateDailyActivity(
    &self,
    activity: DailyActivityModel,
  ) -> Result<(), ResponseModel> {
    let activityId = activity.id.clone();
    let updateModel = DailyActivityUpdateModel {
      _id: activity._id,
      id: activity.id,
      userId: activity.userId,
      date: activity.date,
      todosCreated: activity.todosCreated,
      todosUpdated: activity.todosUpdated,
      todosDeleted: activity.todosDeleted,
      tasksCreated: activity.tasksCreated,
      tasksUpdated: activity.tasksUpdated,
      tasksCompleted: activity.tasksCompleted,
      tasksDeleted: activity.tasksDeleted,
      subtasksCreated: activity.subtasksCreated,
      subtasksUpdated: activity.subtasksUpdated,
      subtasksCompleted: activity.subtasksCompleted,
      subtasksDeleted: activity.subtasksDeleted,
      totalActivity: activity.totalActivity,
      totalTasks: activity.totalTasks,
      completedTasks: activity.completedTasks,
      productivityScore: activity.productivityScore,
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
    };

    let record: Value = to_value(&updateModel).unwrap();

    match self
      .jsonProvider
      .update("daily_activities", &activityId, record)
      .await
    {
      Ok(_) => Ok(()),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't update daily activity! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
