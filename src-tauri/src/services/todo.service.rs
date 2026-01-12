/* sys lib */
use mongodb::bson::doc;
use serde_json::{json, to_value, Value};
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  activity_log::ActivityLogHelper,
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
  mongodb_provider::MongodbProvider,
};

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
  todo_model::{TodoCreateModel, TodoModel, TodoUpdateModel},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct TodoService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
  pub activityLogHelper: ActivityLogHelper,
  relations: Vec<RelationObj>,
}

impl TodoService {
  #[allow(non_snake_case)]
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Arc<MongodbProvider>,
    activityLogHelper: ActivityLogHelper,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      activityLogHelper,
      relations: vec![
        RelationObj {
          nameTable: "tasks".to_string(),
          typeField: TypesField::OneToMany,
          nameField: "todoId".to_string(),
          newNameField: "tasks".to_string(),
          relations: Some(vec![RelationObj {
            nameTable: "subtasks".to_string(),
            typeField: TypesField::OneToMany,
            nameField: "taskId".to_string(),
            newNameField: "subtasks".to_string(),
            relations: None,
          }]),
        },
        RelationObj {
          nameTable: "users".to_string(),
          typeField: TypesField::OneToOne,
          nameField: "userId".to_string(),
          newNameField: "user".to_string(),
          relations: Some(vec![RelationObj {
            nameTable: "profiles".to_string(),
            typeField: TypesField::OneToOne,
            nameField: "profileId".to_string(),
            newNameField: "profile".to_string(),
            relations: None,
          }]),
        },
        RelationObj {
          nameTable: "categories".to_string(),
          typeField: TypesField::ManyToOne,
          nameField: "categories".to_string(),
          newNameField: "categories".to_string(),
          relations: None,
        },
        RelationObj {
          nameTable: "profiles".to_string(),
          typeField: TypesField::ManyToOne,
          nameField: "assignees".to_string(),
          newNameField: "assignees".to_string(),
          relations: Some(vec![RelationObj {
            nameTable: "users".to_string(),
            typeField: TypesField::OneToOne,
            nameField: "userId".to_string(),
            newNameField: "user".to_string(),
            relations: None,
          }]),
        },
      ],
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

    let listTodos = self
      .jsonProvider
      .getAllByField("todos", filter, Some(self.relations.clone()))
      .await;

    match listTodos {
      Ok(mut todos) => {
        todos.sort_by(|a, b| {
          let a_order = a.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          let b_order = b.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          a_order.cmp(&b_order)
        });
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&todos),
        })
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a list of todos! {}", error.to_string()),
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
      Some(json!({ nameField: value }))
    } else {
      None
    };

    let todo = self
      .jsonProvider
      .getByField("todos", filter, Some(self.relations.clone()), "")
      .await;

    match todo {
      Ok(todo) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "".to_string(),
        data: convertDataToObject(&todo),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a todo! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getByAssignee(&self, assigneeId: String) -> Result<ResponseModel, ResponseModel> {
    let listTodos = self
      .mongodbProvider
      .getAllByField(
        "todos",
        Some(doc! { "assignees": { "$in": [assigneeId] } }),
        Some(self.relations.clone()),
      )
      .await;

    match listTodos {
      Ok(mut todos) => {
        todos.sort_by(|a, b| {
          let aOrder = a.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          let bOrder = b.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          aOrder.cmp(&bOrder)
        });
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&todos),
        })
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't get a list of todos! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TodoCreateModel) -> Result<ResponseModel, ResponseModel> {
    let userId = data.userId.clone();
    let modelData: TodoModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let todo = self.jsonProvider.create("todos", record).await;

    match todo {
      Ok(result) => {
        if result {
          let _ = self
            .activityLogHelper
            .logActivity(userId, "todo_created", 1)
            .await;
          Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          })
        } else {
          Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a todo!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't create a todo! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TodoUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let todo = self
      .jsonProvider
      .getByField("todos", None, None, id.as_str())
      .await;

    match todo {
      Ok(todo) => {
        let existingTodoResult: Result<TodoModel, _> =
          serde_json::from_value::<TodoModel>(todo.clone());
        let existingTodo = match existingTodoResult {
          Ok(todo) => todo,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to parse existing todo data".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let userId = existingTodo.userId.clone();
        let updatedTodo = data.applyTo(existingTodo);
        let record: Value = match to_value(&updatedTodo) {
          Ok(val) => val,
          Err(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Failed to serialize updated todo".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
        };

        let updateResult = self
          .jsonProvider
          .update("todos", &id.as_str(), record)
          .await;

        match updateResult {
          Ok(success) => {
            if success {
              let _ = self
                .activityLogHelper
                .logActivity(userId, "todo_updated", 1)
                .await;
              Ok(ResponseModel {
                status: ResponseStatus::Success,
                message: "Todo updated successfully".to_string(),
                data: DataValue::String("".to_string()),
              })
            } else {
              Ok(ResponseModel {
                status: ResponseStatus::Error,
                message: "Couldn't update a todo!".to_string(),
                data: DataValue::String("".to_string()),
              })
            }
          }
          Err(error) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Couldn't update a todo! {}", error.to_string()),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(_) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "Todo not found".to_string(),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<TodoModel>) -> Result<ResponseModel, ResponseModel> {
    let records: Vec<Value> = data
      .into_iter()
      .map(|todo| {
        let value = to_value(&todo).unwrap();
        value
      })
      .collect();

    match self.jsonProvider.updateAll("todos", records).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: "All todos updated successfully".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't update todos! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let todoResponse = self.getByField("id".to_string(), id.clone()).await;
    let userId = if let Ok(response) = &todoResponse {
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

    let tasks = self
      .jsonProvider
      .getAllByField("tasks", Some(json!({ "todoId": id.clone() })), None)
      .await;
    if let Ok(listTasks) = tasks {
      for task in listTasks {
        if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
          let subtasks = self
            .jsonProvider
            .getAllByField("subtasks", Some(json!({ "taskId": taskId })), None)
            .await;
          if let Ok(listSubtasks) = subtasks {
            for subtask in listSubtasks {
              if let Some(subtaskId) = subtask.get("id").and_then(|v| v.as_str()) {
                let _ = self.jsonProvider.delete("subtasks", subtaskId).await;
              }
            }
          }
          let _ = self.jsonProvider.delete("tasks", taskId).await;
        }
      }
    }

    let todo = self.jsonProvider.delete("todos", &id.as_str()).await;

    match todo {
      Ok(result) => {
        if result {
          if !userId.is_empty() {
            let _ = self
              .activityLogHelper
              .logActivity(userId, "todo_deleted", 1)
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
            message: "Couldn't delete a todo!".to_string(),
            data: DataValue::String("".to_string()),
          })
        }
      }
      Err(error) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Couldn't delete a todo! {}", error.to_string()),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
