/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{common::convertDataToArray, json_provider::JsonProvider};

/* models */
use crate::models::{
  daily_activity_model::{DailyActivityCreateModel, DailyActivityModel, DailyActivityUpdateModel},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct DailyActivityService {
  pub jsonProvider: JsonProvider,
}

impl DailyActivityService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self { jsonProvider }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let listDailyActivities = self
      .jsonProvider
      .getAllByField(
        "daily_activities",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        None,
      )
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
          "Couldn't get a list of daily ctivities! {}",
          error.to_string()
        ),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getOrCreateDailyActivity(
    &self,
    userId: String,
    date: String,
  ) -> Result<DailyActivityModel, ResponseModel> {
    let existing = self
      .jsonProvider
      .getAllByField(
        "daily_activities",
        Some(json!({ "userId": userId.clone(), "date": date.clone() })),
        None,
      )
      .await;

    match existing {
      Ok(activities) => {
        if let Some(activityValue) = activities.first() {
          if let Ok(activity) = serde_json::from_value::<DailyActivityModel>(activityValue.clone())
          {
            return Ok(activity);
          }
        }
      }
      Err(_) => {}
    }

    let createModel = DailyActivityCreateModel { userId, date };
    let model: DailyActivityModel = createModel.into();
    let record: Value = to_value(&model).unwrap();

    match self.jsonProvider.create("daily_activities", record).await {
      Ok(_) => Ok(model),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create daily activity! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn logActivity(
    &self,
    userId: String,
    activityType: &str,
    count: i32,
  ) -> Result<(), ResponseModel> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut activity = self.getOrCreateDailyActivity(userId, today).await?;

    match activityType {
      "todo_created" => activity.todosCreated += count,
      "todo_updated" => activity.todosUpdated += count,
      "todo_deleted" => activity.todosDeleted += count,
      "task_created" => {
        activity.tasksCreated += count;
        activity.totalTasks += count;
      }
      "task_updated" => activity.tasksUpdated += count,
      "task_completed" => {
        activity.tasksCompleted += count;
        activity.completedTasks += count;
      }
      "task_deleted" => {
        activity.tasksDeleted += count;
        activity.totalTasks -= count;
        if activity.totalTasks < 0 {
          activity.totalTasks = 0;
        }
      }
      "subtask_created" => activity.subtasksCreated += count,
      "subtask_updated" => activity.subtasksUpdated += count,
      "subtask_completed" => activity.subtasksCompleted += count,
      "subtask_deleted" => activity.subtasksDeleted += count,
      _ => {}
    }

    activity.totalActivity = activity.todosCreated
      + activity.todosUpdated
      + activity.todosDeleted
      + activity.tasksCreated
      + activity.tasksUpdated
      + activity.tasksCompleted
      + activity.tasksDeleted
      + activity.subtasksCreated
      + activity.subtasksUpdated
      + activity.subtasksCompleted
      + activity.subtasksDeleted;

    if activity.totalTasks > 0 {
      activity.productivityScore =
        ((activity.completedTasks as f32 / activity.totalTasks as f32) * 100.0) as i32;
    } else {
      activity.productivityScore = 0;
    }

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
