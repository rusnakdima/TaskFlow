/* sys lib */
use nosql_orm::provider::DatabaseProvider;
use serde_json::{to_value, Value};

/* helpers */
use crate::helpers::common::convert_data_to_array;
use crate::helpers::filter_helper::FilterBuilder;

/* providers */
use nosql_orm::providers::JsonProvider;

/* entities */
use crate::entities::{
  daily_activity_entity::{DailyActivityCreateModel, DailyActivityModel, DailyActivityUpdateModel},
  response_entity::{DataValue, ResponseModel, ResponseStatus},
};

#[derive(Clone)]
pub struct ActivityStorage {
  pub json_provider: JsonProvider,
}

impl ActivityStorage {
  pub fn new(json_provider: JsonProvider) -> Self {
    Self { json_provider }
  }

  pub async fn get_all(&self, filter: Value) -> Result<ResponseModel, ResponseModel> {
    let orm_filter = FilterBuilder::from_json(&filter);

    let list_daily_activities = self
      .json_provider
      .find_many(
        "daily_activities",
        orm_filter.as_ref(),
        None,
        None,
        None,
        true,
      )
      .await;

    match list_daily_activities {
      Ok(daily_activities) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convert_data_to_array(&daily_activities),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a list of daily activities! {}", error),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn get_or_create_daily_activity(
    &self,
    user_id: String,
    date: String,
  ) -> Result<DailyActivityModel, ResponseModel> {
    use nosql_orm::query::Filter;

    let filter = Filter::And(vec![
      Filter::Eq("user_id".to_string(), serde_json::json!(user_id)),
      Filter::Eq("date".to_string(), serde_json::json!(date)),
    ]);

    let existing = self
      .json_provider
      .find_many("daily_activities", Some(&filter), None, None, None, false)
      .await;

    if let Ok(activities) = existing {
      if let Some(activity_value) = activities.first() {
        if let Ok(activity) = serde_json::from_value::<DailyActivityModel>(activity_value.clone()) {
          return Ok(activity);
        }
      }
    }

    let create_model = DailyActivityCreateModel {
      user_id: user_id.clone(),
      date: date.clone(),
    };
    let model: DailyActivityModel = create_model.into();
    let record: Value = to_value(&model).unwrap();

    match self.json_provider.insert("daily_activities", record).await {
      Ok(_) => Ok(model),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create daily activity! {}", error),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  pub async fn update_daily_activity(
    &self,
    activity: DailyActivityModel,
  ) -> Result<(), ResponseModel> {
    let activity_id = activity.id.clone();
    let update_model = DailyActivityUpdateModel {
      id: activity.id,
      user_id: activity.user_id,
      date: activity.date,
      todos_created: activity.todos_created,
      todos_updated: activity.todos_updated,
      todos_deleted: activity.todos_deleted,
      tasks_created: activity.tasks_created,
      tasks_updated: activity.tasks_updated,
      tasks_completed: activity.tasks_completed,
      tasks_deleted: activity.tasks_deleted,
      subtasks_created: activity.subtasks_created,
      subtasks_updated: activity.subtasks_updated,
      subtasks_completed: activity.subtasks_completed,
      subtasks_deleted: activity.subtasks_deleted,
      total_activity: activity.total_activity,
      total_tasks: activity.total_tasks,
      completed_tasks: activity.completed_tasks,
      productivity_score: activity.productivity_score,
      created_at: activity.created_at,
      updated_at: activity.updated_at,
    };

    let record: Value = to_value(&update_model).unwrap();

    match self
      .json_provider
      .update("daily_activities", &activity_id, record)
      .await
    {
      Ok(_) => Ok(()),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't update daily activity! {}", error),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
