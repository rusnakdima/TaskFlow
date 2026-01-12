/* sys lib */
use mongodb::bson::{doc, Document};
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper,
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
  mongodb_provider::MongodbProvider,
};

/* services */
use crate::services::todo_service::TodoService;

/* models */
use crate::models::{
  provider_type_model::ProviderType,
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
  sync_metadata_model::SyncMetadata,
  task_model::{TaskCreateModel, TaskModel, TaskStatus, TaskUpdateModel},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct TaskService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: std::sync::Arc<MongodbProvider>,
  pub todoService: TodoService,
  pub activityLogHelper: ActivityLogHelper,
  relations: Vec<RelationObj>,
}

impl TaskService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: std::sync::Arc<MongodbProvider>,
    todoService: TodoService,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
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
  fn getProviderType(&self, syncMetadata: &SyncMetadata) -> Result<ProviderType, ResponseModel> {
    match (syncMetadata.isOwner, syncMetadata.isPrivate) {
      (true, true) => Ok(ProviderType::Json),
      (false, false) => Ok(ProviderType::Mongo),
      (true, false) => Ok(ProviderType::Mongo),
      (false, true) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Incorrect request: cannot have isOwner false and isPrivate true".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;
    let listTasks = match providerType {
      ProviderType::Json => {
        let filter = if nameField != "" {
          Some(json!({ nameField.clone(): value.clone() }))
        } else {
          None
        };
        self
          .jsonProvider
          .getAllByField("tasks", filter, Some(self.relations.clone()))
          .await
      }
      ProviderType::Mongo => {
        let filter = if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        };
        let docs = self
          .mongodbProvider
          .getAllByField("tasks", filter, Some(self.relations.clone()))
          .await?;
        let values: Result<Vec<Value>, _> = docs
          .into_iter()
          .map(|doc| serde_json::to_value(doc))
          .collect();
        values.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
      }
    };

    match listTasks {
      Ok(mut tasksList) => {
        tasksList.sort_by(|a: &serde_json::Value, b: &serde_json::Value| {
          let aOrder = a.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          let bOrder = b.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          aOrder.cmp(&bOrder)
        });
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&tasksList),
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
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;
    let task = match providerType {
      ProviderType::Json => {
        let filter = if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        };
        self
          .jsonProvider
          .getByField("tasks", filter, Some(self.relations.clone()), "")
          .await
      }
      ProviderType::Mongo => {
        let filter = if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        };
        let doc = self
          .mongodbProvider
          .getByField("tasks", filter, Some(self.relations.clone()), "")
          .await?;
        Ok(serde_json::to_value(doc)?)
      }
    };

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
  pub async fn create(
    &self,
    data: TaskCreateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let todoId = data.todoId.clone();
    let modelData: TaskModel = data.into();
    let record: Value = to_value(&modelData).unwrap();

    let providerType = self.getProviderType(&syncMetadata)?;
    let task = match providerType {
      ProviderType::Json => self.jsonProvider.create("tasks", record).await,
      ProviderType::Mongo => {
        let doc = mongodb::bson::to_document(&record)
          .map_err(|e| format!("Failed to convert to document: {}", e))?;
        self.mongodbProvider.create("tasks", doc).await
      }
    };

    match task {
      Ok(result) => {
        if result {
          let todoResult = self
            .todoService
            .getByField("id".to_string(), todoId, syncMetadata.clone())
            .await;
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
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;
    let taskResult = match providerType {
      ProviderType::Json => {
        self
          .jsonProvider
          .getByField("tasks", None, None, id.as_str())
          .await
      }
      ProviderType::Mongo => {
        let docResult = self
          .mongodbProvider
          .getByField("tasks", None, None, id.as_str())
          .await;
        match docResult {
          Ok(doc) => Ok(serde_json::to_value(doc)?),
          Err(e) => Err(e),
        }
      }
    };

    match taskResult {
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
            .getByField(
              "id".to_string(),
              existingTask.todoId.clone(),
              syncMetadata.clone(),
            )
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

        let updateResult = match providerType {
          ProviderType::Json => {
            self
              .jsonProvider
              .update("tasks", &id.as_str(), record)
              .await
          }
          ProviderType::Mongo => {
            let doc = mongodb::bson::to_document(&record)
              .map_err(|e| format!("Failed to convert to document: {}", e))?;
            self
              .mongodbProvider
              .update("tasks", &id.as_str(), doc)
              .await
          }
        };

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
      Err(_) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Task not found".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(
    &self,
    data: Vec<TaskModel>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;
    let records: Vec<Value> = data
      .into_iter()
      .map(|task| {
        let value = to_value(&task).unwrap();
        value
      })
      .collect();

    match providerType {
      ProviderType::Json => match self.jsonProvider.updateAll("tasks", records).await {
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
      },
      ProviderType::Mongo => {
        let docs: Result<Vec<Document>, _> = records
          .into_iter()
          .map(|record| {
            mongodb::bson::to_document(&record).map_err(|e| format!("Failed to convert: {}", e))
          })
          .collect();
        match docs {
          Ok(docs) => match self.mongodbProvider.updateAll("tasks", docs).await {
            Ok(_) => Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "All tasks updated successfully".to_string(),
              data: DataValue::String("".to_string()),
            }),
            Err(error) => Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Couldn't update all tasks! {}", error.to_string()),
              data: DataValue::String("".to_string()),
            }),
          },
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: e,
            data: DataValue::String("".to_string()),
          }),
        }
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    id: String,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let taskResult = self
      .getByField("id".to_string(), id.clone(), syncMetadata.clone())
      .await;
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
      let todoResult = self
        .todoService
        .getByField("id".to_string(), todoId, syncMetadata.clone())
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
    } else {
      "".to_string()
    };

    let providerType = self.getProviderType(&syncMetadata)?;
    let subtasks = match providerType {
      ProviderType::Json => {
        self
          .jsonProvider
          .getAllByField("subtasks", Some(json!({ "taskId": id.clone() })), None)
          .await
      }
      ProviderType::Mongo => {
        let filter = doc! { "taskId": id.clone() };
        let docs = self
          .mongodbProvider
          .getAllByField("subtasks", Some(filter), None)
          .await?;
        let values: Result<Vec<Value>, _> = docs
          .into_iter()
          .map(|doc| serde_json::to_value(doc))
          .collect();
        Ok(values.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?)
      }
    };

    if let Ok(subtasksList) = subtasks {
      for subtask in subtasksList {
        if let Some(subtaskId) = subtask
          .get("id")
          .and_then(|v: &serde_json::Value| v.as_str())
        {
          let _ = match providerType {
            ProviderType::Json => self.jsonProvider.delete("subtasks", subtaskId).await,
            ProviderType::Mongo => self.mongodbProvider.delete("subtasks", subtaskId).await,
          };
        }
      }
    }

    let task = match providerType {
      ProviderType::Json => self.jsonProvider.delete("tasks", &id.as_str()).await,
      ProviderType::Mongo => self.mongodbProvider.delete("tasks", &id.as_str()).await,
    };
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
