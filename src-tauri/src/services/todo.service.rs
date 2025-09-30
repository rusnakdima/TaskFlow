/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* services */
use crate::services::daily_activity_service::DailyActivityService;

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
  pub dailyActivityService: DailyActivityService,
  relations: Vec<RelationObj>,
}

impl TodoService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider, dailyActivityService: DailyActivityService) -> Self {
    Self {
      jsonProvider,
      dailyActivityService,
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
    let listTodos = self
      .jsonProvider
      .getAllByField(
        "todos",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
      )
      .await;
    match listTodos {
      Ok(mut todos) => {
        todos.sort_by(|a, b| {
          let a_order = a.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          let b_order = b.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
          a_order.cmp(&b_order)
        });
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&todos),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of todos! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let todo = self
      .jsonProvider
      .getByField(
        "todos",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
        "",
      )
      .await;
    match todo {
      Ok(todo) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToObject(&todo),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn getByAssignee(&self, assigneeId: String) -> Result<ResponseModel, ResponseModel> {
    let listTodos = self
      .jsonProvider
      .getAllByField(
        "todos",
        Some(json!({ "assignees": { "$in": [assigneeId] } })),
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
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&todos),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of todos! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TodoCreateModel) -> Result<ResponseModel, ResponseModel> {
    let modelData: TodoModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let todo = self.jsonProvider.create("todos", record).await;
    match todo {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a todo!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't create a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: TodoUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let modelData: TodoModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let todo = self
      .jsonProvider
      .update("todos", &id.as_str(), record)
      .await;
    match todo {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't update a todo!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't update a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let tasks = self
      .jsonProvider
      .getAllByField("tasks", Some(json!({ "todoId": id })), None)
      .await;

    match tasks {
      Ok(tasksList) => {
        for task in tasksList {
          if let Some(taskId) = task.get("id").and_then(|v| v.as_str()) {
            let subtasks = self
              .jsonProvider
              .getAllByField("subtasks", Some(json!({ "taskId": taskId })), None)
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
            let _ = self.jsonProvider.delete("tasks", taskId).await;
          }
        }
      }
      Err(_) => {}
    }

    let todo = self.jsonProvider.delete("todos", &id.as_str()).await;
    match todo {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't delete a todo!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't delete a todo! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn createAndLog(&self, data: TodoCreateModel) -> Result<ResponseModel, ResponseModel> {
    let result = self.create(data.clone()).await;
    if result.is_ok() {
      let _ = self
        .dailyActivityService
        .logActivity(data.userId, "todo_created", 1)
        .await;
    }
    result
  }

  #[allow(non_snake_case)]
  pub async fn updateAndLog(
    &self,
    id: String,
    data: TodoUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let result = self.update(id, data.clone()).await;
    if result.is_ok() {
      let _ = self
        .dailyActivityService
        .logActivity(data.userId, "todo_updated", 1)
        .await;
    }
    result
  }

  #[allow(non_snake_case)]
  pub async fn deleteAndLog(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let todoResult = self.getByField("id".to_string(), id.clone()).await;
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
    let result = self.delete(id).await;
    if result.is_ok() && !userId.is_empty() {
      let _ = self
        .dailyActivityService
        .logActivity(userId, "todo_deleted", 1)
        .await;
    }
    result
  }
}
