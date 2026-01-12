/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* services */
use crate::services::{
  daily_activity_service::DailyActivityService, task_service::TaskService,
  todo_service::TodoService,
};

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
  task_model::TaskStatus,
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct SubtaskService {
  pub jsonProvider: JsonProvider,
  pub taskService: TaskService,
  pub todoService: TodoService,
  pub dailyActivityService: DailyActivityService,
}

impl SubtaskService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    taskService: TaskService,
    todoService: TodoService,
    dailyActivityService: DailyActivityService,
  ) -> Self {
    Self {
      jsonProvider,
      taskService,
      todoService,
      dailyActivityService,
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = if nameField != "" {
      Some(json!({ nameField: value }))
    } else {
      None
    };

    let listSubtasks = self
      .jsonProvider
      .getAllByField("subtasks", filter, None)
      .await;

    match listSubtasks {
      Ok(mut subtasks) => {
        subtasks.sort_by(|a, b| {
          let a_order = a.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          let b_order = b.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          a_order.cmp(&b_order)
        });
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&subtasks),
        })
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a list of subtasks! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let subtask = self
      .jsonProvider
      .getByField(
        "subtasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        None,
        "",
      )
      .await;

    match subtask {
      Ok(subtask) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToObject(&subtask),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a subtask! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: SubtaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    let modelData: SubtaskModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let subtask = self.jsonProvider.create("subtasks", record).await;

    match subtask {
      Ok(result) => {
        if result {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a subtask!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create a subtask! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let subtask = self
      .jsonProvider
      .getByField("subtasks", None, None, id.as_str())
      .await;

    match subtask {
      Ok(subtask) => {
        let existingSubtask: SubtaskModel =
          match serde_json::from_value::<SubtaskModel>(subtask.clone()) {
            Ok(subtask) => subtask,
            Err(_) => {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: "Failed to parse existing subtask data".to_string(),
                data: DataValue::String("".to_string()),
              });
            }
          };

        let updatedSubtask = data.applyTo(existingSubtask);
        let record: Value = match to_value(&updatedSubtask) {
          Ok(val) => val,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to serialize updated subtask".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let updateResult = self
          .jsonProvider
          .update("subtasks", &id.as_str(), record)
          .await;

        match updateResult {
          Ok(success) => {
            if success {
              Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Subtask updated successfully".to_string(),
                data: DataValue::String("".to_string()),
              })
            } else {
              Ok(ResponseModel {
                status: ResponseStatus::Error,
                message: "Couldn't update a subtask!".to_string(),
                data: DataValue::String("".to_string()),
              })
            }
          }
          Err(error) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Couldn't update a subtask! {}", error.to_string()),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Existing subtask not found: {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<SubtaskModel>) -> Result<ResponseModel, ResponseModel> {
    let records: Vec<Value> = data
      .into_iter()
      .map(|subtask| {
        let value = to_value(&subtask).unwrap();
        value
      })
      .collect();

    match self.jsonProvider.updateAll("subtasks", records).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "All subtasks updated successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't update subtasks! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let subtask = self.jsonProvider.delete("subtasks", &id.as_str()).await;
    match subtask {
      Ok(result) => {
        if result {
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't delete a subtask!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't delete a subtask! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  async fn logActivity(&self, taskId: String, action: &str, count: i32) {
    let taskResult = self.taskService.getByField("id".to_string(), taskId).await;
    let todoId = if let Ok(response) = &taskResult {
      match &response.data {
        DataValue::Object(obj) => obj
          .get("todoId")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string(),
        _ => "".to_string(),
      }
    } else {
      "".to_string()
    };
    if !todoId.is_empty() {
      let todoResult = self.todoService.getByField("id".to_string(), todoId).await;
      let userId = if let Ok(response) = &todoResult {
        match &response.data {
          DataValue::Object(obj) => obj
            .get("userId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
          _ => "".to_string(),
        }
      } else {
        "".to_string()
      };
      if !userId.is_empty() {
        let _ = self
          .dailyActivityService
          .logActivity(userId, action, count)
          .await;
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn createAndLog(
    &self,
    data: SubtaskCreateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let result = self.create(data.clone()).await;
    if result.is_ok() {
      self.logActivity(data.taskId, "subtask_created", 1).await;
    }
    result
  }

  #[allow(non_snake_case)]
  pub async fn updateAndLog(
    &self,
    id: String,
    data: SubtaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let oldSubtaskResult = self.getByField("id".to_string(), id.clone()).await;
    let wasCompleted = if let Ok(response) = &oldSubtaskResult {
      match &response.data {
        DataValue::Object(obj) => {
          if let Some(status_val) = obj.get("status").and_then(|v| v.as_str()) {
            status_val == "completed" || status_val == "skipped"
          } else {
            false
          }
        }
        _ => false,
      }
    } else {
      false
    };
    let result = self.update(id, data.clone()).await;
    if result.is_ok() {
      if let Some(ref taskId) = data.taskId {
        self.logActivity(taskId.clone(), "subtask_updated", 1).await;
        if let Some(ref status) = data.status {
          let isNowCompleted = matches!(status, TaskStatus::Completed | TaskStatus::Skipped);
          if isNowCompleted && !wasCompleted {
            self
              .logActivity(taskId.clone(), "subtask_completed", 1)
              .await;
          }
        }
      }
    }
    result
  }

  #[allow(non_snake_case)]
  pub async fn deleteAndLog(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let subtaskResult = self.getByField("id".to_string(), id.clone()).await;
    let taskId = if let Ok(response) = &subtaskResult {
      match &response.data {
        DataValue::Object(obj) => obj
          .get("taskId")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string(),
        _ => "".to_string(),
      }
    } else {
      "".to_string()
    };
    let result = self.delete(id).await;
    if result.is_ok() && !taskId.is_empty() {
      self.logActivity(taskId, "subtask_deleted", 1).await;
    }
    result
  }
}
