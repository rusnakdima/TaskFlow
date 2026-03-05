/* sys */
use mongodb::bson::doc;
use serde_json::Value;
use std::sync::Arc;

/* helpers */
use crate::helpers::common::convertDataToObject;

/* providers */
use crate::providers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

/// AdminManager - Handles admin operations for data management
pub struct AdminManager {
  pub mongodbProvider: Arc<MongodbProvider>,
}

impl AdminManager {
  pub fn new(mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self { mongodbProvider }
  }

  /// Get all data for admin view with relations
  pub async fn get_all_data_for_admin(&self) -> Result<ResponseModel, ResponseModel> {
    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    let user_relations = vec![RelationObj {
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

    let todo_relations = vec![
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
    ];

    let mut all_data = serde_json::Map::new();

    for table in tables {
      let relations = if table == "todos" {
        Some(todo_relations.clone())
      } else if table == "categories" {
        Some(user_relations.clone())
      } else {
        None
      };

      let docs = match self.mongodbProvider.getAll(table, None, relations).await {
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
        .map(|doc| serde_json::to_value(&doc).unwrap())
        .collect();

      all_data.insert(table.to_string(), serde_json::Value::Array(values));
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "All data retrieved for admin".to_string(),
      data: convertDataToObject(&all_data),
    })
  }

  /// Permanently delete a record
  pub async fn permanently_delete_record(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    match self.mongodbProvider.delete(&table, &id).await {
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

  /// Toggle delete status of a record
  pub async fn toggle_delete_status(
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

    let is_deleted = record.get_bool("isDeleted").unwrap_or(false);
    let new_status = !is_deleted;

    let update_doc = doc! {
      "isDeleted": new_status,
      "updatedAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    };

    match self.mongodbProvider.update(&table, &id, update_doc).await {
      Ok(_) => Ok(ResponseModel {
        status: ResponseStatus::Success,
        message: format!("Record delete status toggled to {}", new_status),
        data: DataValue::String("".to_string()),
      }),
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error updating record: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
