/* sys */
use mongodb::bson::doc;
use serde_json::Value;
use std::sync::Arc;

/* helpers */
use crate::helpers::common::convertDataToObject;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

/// AdminManager - Handles admin operations for data management
pub struct AdminManager {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Arc<MongodbProvider>,
}

impl AdminManager {
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
    }
  }

  /// Get current UTC timestamp in RFC3339 format
  fn getCurrentTimestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
  }

  /// Get all data for admin view with relations (includes deleted and non-deleted records)
  pub async fn getAllDataForAdmin(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    // Relations for user + profile
    let userRelations = vec![RelationObj {
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
    }];

    // Relations for todos: user (with profile) + categories (with user + profile) + tasks (with subtasks)
    let todoRelations = vec![
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
        relations: Some(vec![RelationObj {
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
        }]),
      },
      RelationObj {
        nameTable: "tasks".to_string(),
        typeField: TypesField::OneToMany,
        nameField: "todoId".to_string(),
        newNameField: "tasks".to_string(),
        relations: Some(vec![
          RelationObj {
            nameTable: "subtasks".to_string(),
            typeField: TypesField::OneToMany,
            nameField: "taskId".to_string(),
            newNameField: "subtasks".to_string(),
            relations: None,
          },
        ]),
      },
    ];

    // Relations for tasks: todo (with user + profile) + subtasks
    let taskRelations = vec![
      RelationObj {
        nameTable: "todos".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "todoId".to_string(),
        newNameField: "todo".to_string(),
        relations: Some(vec![
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
            relations: Some(vec![RelationObj {
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
            }]),
          },
        ]),
      },
      RelationObj {
        nameTable: "subtasks".to_string(),
        typeField: TypesField::OneToMany,
        nameField: "taskId".to_string(),
        newNameField: "subtasks".to_string(),
        relations: None,
      },
    ];

    // Relations for subtasks: task (with todo, user, profile)
    let subtaskRelations = vec![
      RelationObj {
        nameTable: "tasks".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "taskId".to_string(),
        newNameField: "task".to_string(),
        relations: Some(vec![
          RelationObj {
            nameTable: "todos".to_string(),
            typeField: TypesField::OneToOne,
            nameField: "todoId".to_string(),
            newNameField: "todo".to_string(),
            relations: Some(vec![
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
                relations: Some(vec![RelationObj {
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
                }]),
              },
            ]),
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
        ]),
      },
    ];

    let mut allData = serde_json::Map::new();

    for table in tables {
      let relations = if table == "todos" {
        Some(todoRelations.clone())
      } else if table == "tasks" {
        Some(taskRelations.clone())
      } else if table == "subtasks" {
        Some(subtaskRelations.clone())
      } else if table == "categories" {
        Some(userRelations.clone())
      } else {
        None
      };

      // Use getAllWithDeleted to include both deleted and non-deleted records
      let docs = match self.mongodbProvider.getAllWithDeleted(table, Some(doc! {}), relations).await {
        Ok(docs) => docs,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      };

      let values: Vec<Value> = docs
        .into_iter()
        .filter_map(|doc| serde_json::to_value(&doc).ok())
        .collect();

      allData.insert(table.to_string(), serde_json::Value::Array(values));
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "All data retrieved for admin".to_string(),
      data: convertDataToObject(&allData),
    })
  }

  /// Permanently delete a record
  pub async fn permanentlyDeleteRecord(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    // 1. First, find which user this record belongs to
    let record = match self.mongodbProvider.get(&table, None, None, &id).await {
      Ok(doc) => doc,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Record not found: {}", e),
          data: DataValue::String("".to_string()),
        })
      }
    };

    let userId = if table == "todos" || table == "categories" || table == "daily_activities" {
      record.get_str("userId").ok().map(|s| s.to_string())
    } else if table == "tasks" {
      let todoId = record.get_str("todoId").ok();
      if let Some(tid) = todoId {
        let todo = self
          .mongodbProvider
          .get("todos", None, None, tid)
          .await
          .ok();
        todo.and_then(|t| t.get_str("userId").ok().map(|s| s.to_string()))
      } else {
        None
      }
    } else if table == "subtasks" {
      let taskId = record.get_str("taskId").ok();
      if let Some(tid) = taskId {
        let task = self
          .mongodbProvider
          .get("tasks", None, None, tid)
          .await
          .ok();
        let todoId = task.and_then(|t| t.get_str("todoId").ok().map(|s| s.to_string()));
        if let Some(toid) = todoId {
          let todo = self
            .mongodbProvider
            .get("todos", None, None, &toid)
            .await
            .ok();
          todo.and_then(|t| t.get_str("userId").ok().map(|s| s.to_string()))
        } else {
          None
        }
      } else {
        None
      }
    } else {
      None
    };

    // 2. Import all data for this user from cloud to local before deleting
    // This ensures we have the latest state and don't accidentally sync back older "deleted" flags
    if let Some(uid) = userId {
      let _ = self
        .mongodbProvider
        .importToLocal(uid, &self.jsonProvider)
        .await;
    }

    // 3. Cascade delete for todos and tasks in MongoDB and Local JSON
    if table == "todos" {
      // First permanently delete all tasks (including deleted ones)
      let tasks = self
        .mongodbProvider
        .getAllWithDeleted("tasks", Some(doc! { "todoId": &id }), None)
        .await
        .unwrap_or_default();

      for task in tasks {
        if let Ok(taskId) = task.get_str("id") {
          // Permanently delete subtasks first (including deleted ones)
          let subtasks = self
            .mongodbProvider
            .getAllWithDeleted("subtasks", Some(doc! { "taskId": taskId }), None)
            .await
            .unwrap_or_default();

          for subtask in subtasks {
            if let Ok(subtaskId) = subtask.get_str("id") {
              let _ = self.mongodbProvider.hardDelete("subtasks", subtaskId).await;
              let _ = self.jsonProvider.hardDelete("subtasks", subtaskId).await;
            }
          }

          // Then permanently delete task
          let _ = self.mongodbProvider.hardDelete("tasks", taskId).await;
          let _ = self.jsonProvider.hardDelete("tasks", taskId).await;
        }
      }
    } else if table == "tasks" {
      // Permanently delete all subtasks (including deleted ones)
      let subtasks = self
        .mongodbProvider
        .getAllWithDeleted("subtasks", Some(doc! { "taskId": &id }), None)
        .await
        .unwrap_or_default();

      for subtask in subtasks {
        if let Ok(subtaskId) = subtask.get_str("id") {
          let _ = self.mongodbProvider.hardDelete("subtasks", subtaskId).await;
          let _ = self.jsonProvider.hardDelete("subtasks", subtaskId).await;
        }
      }
    }

    match self.mongodbProvider.hardDelete(&table, &id).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: format!("Record permanently deleted from {}", table),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error deleting record: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }

  /// Toggle delete status of a record with cascade delete/restore
  pub async fn toggleDeleteStatus(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    // First get the record to know current status
    let record = match self.mongodbProvider.get(&table, None, None, &id).await {
      Ok(doc) => doc,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Record not found: {}", e),
          data: DataValue::String("".to_string()),
        })
      }
    };

    let isDeleted = record.get_bool("isDeleted").unwrap_or(false);
    let newStatus = !isDeleted;
    let timestamp = Self::getCurrentTimestamp();

    let updateDoc = doc! {
      "isDeleted": newStatus,
      "updatedAt": timestamp.clone()
    };

    // Cascade to children based on new status
    if table == "todos" {
      // Get all tasks (including deleted ones)
      let tasks = self
        .mongodbProvider
        .getAllWithDeleted("tasks", Some(doc! { "todoId": &id }), None)
        .await
        .unwrap_or_default();

      for task in tasks {
        if let Ok(taskId) = task.get_str("id") {
          // Get all subtasks for this task (including deleted ones)
          let subtasks = self
            .mongodbProvider
            .getAllWithDeleted("subtasks", Some(doc! { "taskId": taskId }), None)
            .await
            .unwrap_or_default();

          // Update all subtasks
          for subtask in subtasks {
            if let Ok(subtaskId) = subtask.get_str("id") {
              let subtaskUpdate = doc! {
                "isDeleted": newStatus,
                "updatedAt": timestamp.clone()
              };
              let _ = self.mongodbProvider.update("subtasks", subtaskId, subtaskUpdate.clone()).await;
              // Convert Document to Value for JSON provider
              let subtaskUpdateJson: serde_json::Value = serde_json::to_value(&subtaskUpdate).unwrap_or_default();
              let _ = self.jsonProvider.update("subtasks", subtaskId, subtaskUpdateJson).await;
            }
          }

          // Update task
          let taskUpdate = doc! {
            "isDeleted": newStatus,
            "updatedAt": timestamp.clone()
          };
          let _ = self.mongodbProvider.update("tasks", taskId, taskUpdate.clone()).await;
          // Convert Document to Value for JSON provider
          let taskUpdateJson: serde_json::Value = serde_json::to_value(&taskUpdate).unwrap_or_default();
          let _ = self.jsonProvider.update("tasks", taskId, taskUpdateJson).await;
        }
      }
    } else if table == "tasks" {
      // Get all subtasks for this task (including deleted ones)
      let subtasks = self
        .mongodbProvider
        .getAllWithDeleted("subtasks", Some(doc! { "taskId": &id }), None)
        .await
        .unwrap_or_default();

      // Update all subtasks
      for subtask in subtasks {
        if let Ok(subtaskId) = subtask.get_str("id") {
          let update = doc! {
            "isDeleted": newStatus,
            "updatedAt": timestamp.clone()
          };
          let _ = self.mongodbProvider.update("subtasks", subtaskId, update.clone()).await;
          // Convert Document to Value for JSON provider
          let updateJson: serde_json::Value = serde_json::to_value(&update).unwrap_or_default();
          let _ = self.jsonProvider.update("subtasks", subtaskId, updateJson).await;
        }
      }
    }

    // Update the main record
    match self.mongodbProvider.update(&table, &id, updateDoc.clone()).await {
      Ok(_) => {
        // Also update local JSON
        let updateDocJson: serde_json::Value = serde_json::to_value(&updateDoc).unwrap_or_default();
        let _ = self.jsonProvider.update(&table, &id, updateDocJson).await;
        
        Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: format!("Record delete status toggled to {}", newStatus),
          data: DataValue::String("".to_string()),
        })
      },
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error updating record: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
