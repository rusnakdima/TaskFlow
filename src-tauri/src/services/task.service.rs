/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* services */
use crate::services::{daily_activity_service::DailyActivityService, todo_service::TodoService};

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
  task_model::{TaskCreateModel, TaskModel, TaskUpdateModel},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct TaskService {
  pub jsonProvider: JsonProvider,
  pub todoService: TodoService,
  pub dailyActivityService: DailyActivityService,
  relations: Vec<RelationObj>,
}

impl TaskService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    todoService: TodoService,
    dailyActivityService: DailyActivityService,
  ) -> Self {
    Self {
      jsonProvider,
      todoService,
      dailyActivityService,
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
    let listTasks = self
      .jsonProvider
      .getAllByField(
        "tasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
      )
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
    let task = self
      .jsonProvider
      .getByField(
        "tasks",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
        "",
      )
      .await;
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
    let modelData: TaskModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let task = self.jsonProvider.create("tasks", record).await;
    match task {
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

  #[allow(non_snake_case)]
  async fn logActivity(&self, todoId: String, action: &str, count: i32) {
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

  #[allow(non_snake_case)]
  pub async fn createAndLog(&self, data: TaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    let result = self.create(data.clone()).await;
    if result.is_ok() {
      self.logActivity(data.todoId, "task_created", 1).await;
    }
    result
  }

  #[allow(non_snake_case)]
  pub async fn updateAndLog(
    &self,
    id: String,
    data: TaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let oldTaskResult = self.getByField("id".to_string(), id.clone()).await;
    let wasCompleted = if let Ok(response) = &oldTaskResult {
      match &response.data {
        DataValue::Object(obj) => obj
          .get("isCompleted")
          .and_then(|v| v.as_bool())
          .unwrap_or(false),
        _ => false,
      }
    } else {
      false
    };

    let result = self.update(id, data.clone()).await;
    if result.is_ok() {
      if let Some(ref todoId) = data.todoId {
        self.logActivity(todoId.clone(), "task_updated", 1).await;
        if let Some(isCompleted) = data.isCompleted {
          if isCompleted && !wasCompleted {
            self.logActivity(todoId.clone(), "task_completed", 1).await;
          }
        }
      }
    }
    result
  }

  #[allow(non_snake_case)]
  pub async fn deleteAndLog(&self, id: String) -> Result<ResponseModel, ResponseModel> {
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
    let result = self.delete(id).await;
    if result.is_ok() && !todoId.is_empty() {
      self.logActivity(todoId, "task_deleted", 1).await;
    }
    result
  }
}
