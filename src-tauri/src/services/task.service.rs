/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper,
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* services */
use crate::services::todo_service::TodoService;

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
  task_model::{TaskCreateModel, TaskModel, TaskStatus, TaskUpdateModel},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct TaskService {
  pub jsonProvider: JsonProvider,
  pub todoService: TodoService,
  pub activityLogHelper: ActivityLogHelper,
  relations: Vec<RelationObj>,
}

impl TaskService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    todoService: TodoService,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      jsonProvider,
      todoService,
      activityLogHelper,
      relations: vec![RelationObj {
        nameTable: "subtasks".to_string(),
        typeField: TypesField::OneToMany,
        nameField: "taskId".to_string(),
        newNameField: "subtasks".to_string(),
        relations: None,
      }],
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let filter = if nameField != "" {
      Some(json!({ nameField.clone(): value.clone() }))
    } else {
      None
    };

    let listTasks = self
      .jsonProvider
      .getAllByField("tasks", filter, Some(self.relations.clone()))
      .await;

    match listTasks {
      Ok(mut tasks) => {
        tasks.sort_by(|a, b| {
          let a_order = a.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          let b_order = b.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          a_order.cmp(&b_order)
        });
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&tasks),
        })
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a list of tasks! {}", error.to_string()),
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
    let filter = if nameField != "" {
      Some(json!({ nameField: value.clone() }))
    } else {
      None
    };

    let task = self
      .jsonProvider
      .getByField("tasks", filter.clone(), Some(self.relations.clone()), "")
      .await;
    if let Ok(task) = task {
      return Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToObject(&task),
      });
    }

    match task {
      Ok(task) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToObject(&task),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a task! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    let todoId = data.todoId.clone();
    let modelData: TaskModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let task = self.jsonProvider.create("tasks", record).await;

    match task {
      Ok(result) => {
        if result {
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
              .activityLogHelper
              .logActivity(userId, "task_created", 1)
              .await;
          }
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a task!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create a task! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let task = self
      .jsonProvider
      .getByField("tasks", None, None, id.as_str())
      .await;

    match task {
      Ok(task) => {
        let existingTask: TaskModel = match serde_json::from_value::<TaskModel>(task.clone()) {
          Ok(task) => task,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to parse existing task data".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let wasCompleted = matches!(
          existingTask.status,
          TaskStatus::Completed | TaskStatus::Skipped
        );
        let userId = {
          let todoResult = self
            .todoService
            .getByField("id".to_string(), existingTask.todoId.clone())
            .await;
          if let Ok(response) = &todoResult {
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
          }
        };
        let updatedTask = data.applyTo(existingTask);
        let record: Value = match to_value(&updatedTask) {
          Ok(val) => val,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to serialize updated task".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let updateResult = self
          .jsonProvider
          .update("tasks", &id.as_str(), record)
          .await;

        match updateResult {
          Ok(success) => {
            if success {
              if !userId.is_empty() {
                let _ = self
                  .activityLogHelper
                  .logActivity(userId.clone(), "task_updated", 1)
                  .await;
                let isNowCompleted = matches!(
                  updatedTask.status,
                  TaskStatus::Completed | TaskStatus::Skipped
                );
                if isNowCompleted && !wasCompleted {
                  let _ = self
                    .activityLogHelper
                    .logActivity(userId, "task_completed", 1)
                    .await;
                }
              }
              Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Task updated successfully".to_string(),
                data: DataValue::String("".to_string()),
              })
            } else {
              Ok(ResponseModel {
                status: ResponseStatus::Error,
                message: "Couldn't update a task!".to_string(),
                data: DataValue::String("".to_string()),
              })
            }
          }
          Err(error) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Couldn't update a task! {}", error.to_string()),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Existing task not found: {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<TaskModel>) -> Result<ResponseModel, ResponseModel> {
    let records: Vec<Value> = data
      .into_iter()
      .map(|task| {
        let value = to_value(&task).unwrap();
        value
      })
      .collect();

    match self.jsonProvider.updateAll("tasks", records).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "All tasks updated successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't update tasks! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let taskResult = self.getByField("id".to_string(), id.clone()).await;
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
    let userId = if !todoId.is_empty() {
      let todoResult = self.todoService.getByField("id".to_string(), todoId).await;
      if let Ok(response) = &todoResult {
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
      }
    } else {
      "".to_string()
    };

    let subtasks = self
      .jsonProvider
      .getAllByField("subtasks", Some(json!({ "taskId": id })), None)
      .await;

    match subtasks {
      Ok(subtasksList) => {
        for subtask in subtasksList {
          if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
            let _ = self.jsonProvider.delete("subtasks", subtaskId).await;
          }
        }
      }
      Err(_) => {}
    }

    let task = self.jsonProvider.delete("tasks", &id.as_str()).await;
    match task {
      Ok(result) => {
        if result {
          if !userId.is_empty() {
            let _ = self
              .activityLogHelper
              .logActivity(userId, "task_deleted", 1)
              .await;
          }
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't delete a task!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't delete a task! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
