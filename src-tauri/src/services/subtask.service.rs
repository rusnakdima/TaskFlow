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
use crate::services::{task_service::TaskService, todo_service::TodoService};

/* models */
use crate::models::{
  provider_type_model::ProviderType,
  response_model::{DataValue, ResponseModel, ResponseStatus},
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
  sync_metadata_model::SyncMetadata,
  task_model::TaskStatus,
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct SubtaskService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: std::sync::Arc<MongodbProvider>,
  pub taskService: TaskService,
  pub todoService: TodoService,
  pub activityLogHelper: ActivityLogHelper,
}

impl SubtaskService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: std::sync::Arc<MongodbProvider>,
    taskService: TaskService,
    todoService: TodoService,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      taskService,
      todoService,
      activityLogHelper,
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
    let listSubtasks = match providerType {
      ProviderType::Json => {
        let filter = if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        };
        self
          .jsonProvider
          .getAllByField("subtasks", filter, None)
          .await
      }
      ProviderType::Mongo => {
        let filter = if nameField != "" {
          Some(doc! { nameField: value })
        } else {
          None
        };
        let docs = self
          .todoService
          .mongodbProvider
          .getAllByField("subtasks", filter, None)
          .await?;
        let values: Result<Vec<Value>, _> = docs
          .into_iter()
          .map(|doc| serde_json::to_value(doc))
          .collect();
        values.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
      }
    };

    match listSubtasks {
      Ok(mut subtasks) => {
        subtasks.sort_by(|a: &serde_json::Value, b: &serde_json::Value| {
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
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;
    let subtask = match providerType {
      ProviderType::Json => {
        let filter = if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        };
        self
          .jsonProvider
          .getByField("subtasks", filter, None, "")
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
          .getByField("subtasks", filter, None, "")
          .await?;
        Ok(serde_json::to_value(doc)?)
      }
    };

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
  pub async fn create(
    &self,
    data: SubtaskCreateModel,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let taskId = data.taskId.clone();
    let modelData: SubtaskModel = data.into();
    let record: Value = to_value(&modelData).unwrap();

    let providerType = self.getProviderType(&syncMetadata)?;
    let subtask = match providerType {
      ProviderType::Json => self.jsonProvider.create("subtasks", record).await,
      ProviderType::Mongo => {
        let doc = mongodb::bson::to_document(&record)
          .map_err(|e| format!("Failed to convert to document: {}", e))?;
        self.mongodbProvider.create("subtasks", doc).await
      }
    };

    match subtask {
      Ok(result) => {
        if result {
          let taskResult = self
            .taskService
            .getByField("id".to_string(), taskId, syncMetadata.clone())
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
          if !todoId.is_empty() {
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
                .logActivity(userId, "subtask_created", 1)
                .await;
            }
          }
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
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;

    let subtask = match providerType {
      ProviderType::Json => {
        self
          .jsonProvider
          .getByField("subtasks", None, None, id.as_str())
          .await
      }
      ProviderType::Mongo => {
        let filter = Some(doc! { "id": &id });
        let doc = self
          .mongodbProvider
          .getByField("subtasks", filter, None, "")
          .await?;
        Ok(serde_json::to_value(doc)?)
      }
    };

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

        let wasCompleted = matches!(
          existingSubtask.status,
          TaskStatus::Completed | TaskStatus::Skipped
        );
        let userId = {
          let taskResult = self
            .taskService
            .getByField(
              "id".to_string(),
              existingSubtask.taskId.clone(),
              syncMetadata.clone(),
            )
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
          if !todoId.is_empty() {
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

        // Update based on provider type
        let updateResult = match providerType {
          ProviderType::Json => {
            self
              .jsonProvider
              .update("subtasks", &id.as_str(), record)
              .await
          }
          ProviderType::Mongo => {
            let doc = mongodb::bson::to_document(&record)
              .map_err(|e| format!("Failed to convert to document: {}", e))?;
            self.mongodbProvider.update("subtasks", &id, doc).await
          }
        };

        match updateResult {
          Ok(success) => {
            if success {
              if !userId.is_empty() {
                let _ = self
                  .activityLogHelper
                  .logActivity(userId.clone(), "subtask_updated", 1)
                  .await;
                let isNowCompleted = matches!(
                  updatedSubtask.status,
                  TaskStatus::Completed | TaskStatus::Skipped
                );
                if isNowCompleted && !wasCompleted {
                  let _ = self
                    .activityLogHelper
                    .logActivity(userId, "subtask_completed", 1)
                    .await;
                }
              }
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
  pub async fn updateAll(
    &self,
    data: Vec<SubtaskModel>,
    syncMetadata: SyncMetadata,
  ) -> Result<ResponseModel, ResponseModel> {
    let providerType = self.getProviderType(&syncMetadata)?;
    let records: Vec<Value> = data
      .into_iter()
      .map(|subtask| {
        let value = to_value(&subtask).unwrap();
        value
      })
      .collect();

    match providerType {
      ProviderType::Json => match self.jsonProvider.updateAll("subtasks", records).await {
        Ok(_) => Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "All subtasks updated successfully".to_string(),
          data: DataValue::String("".to_string()),
        }),
        Err(error) => Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't update all subtasks! {}", error.to_string()),
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
          Ok(docs) => match self
            .todoService
            .mongodbProvider
            .updateAll("subtasks", docs)
            .await
          {
            Ok(_) => Ok(ResponseModel {
              status: ResponseStatus::Success,
              message: "All subtasks updated successfully".to_string(),
              data: DataValue::String("".to_string()),
            }),
            Err(error) => Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Couldn't update all subtasks! {}", error.to_string()),
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
    let providerType = self.getProviderType(&syncMetadata)?;
    let subtaskResult = self
      .getByField("id".to_string(), id.clone(), syncMetadata.clone())
      .await;
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
    let userId = if !taskId.is_empty() {
      let taskResult = self
        .taskService
        .getByField("id".to_string(), taskId, syncMetadata.clone())
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
      if !todoId.is_empty() {
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
      }
    } else {
      "".to_string()
    };

    let subtask = match providerType {
      ProviderType::Json => self.jsonProvider.delete("subtasks", &id.as_str()).await,
      ProviderType::Mongo => {
        self
          .todoService
          .mongodbProvider
          .delete("subtasks", &id.as_str())
          .await
      }
    };
    match subtask {
      Ok(result) => {
        if result {
          if !userId.is_empty() {
            let _ = self
              .activityLogHelper
              .logActivity(userId, "subtask_deleted", 1)
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
}
