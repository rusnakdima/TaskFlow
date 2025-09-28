/* sys */
use std::sync::Arc;

/* helpers */
use crate::{
  helpers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider},
  models::response_model::{DataValue, ResponseStatus},
};

/* mongodb */
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::{json, Value};

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
pub struct ManageDbService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongodbProvider>>,
}

impl ManageDbService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: Option<Arc<MongodbProvider>>) -> Self {
    Self {
      jsonProvider: jsonProvider,
      mongodbProvider: mongodbProvider,
    }
  }

  #[allow(non_snake_case)]
  fn shouldUpdateTarget(source: &Value, target: &Value) -> bool {
    let sourceTs = source.get("updatedAt").and_then(|v| v.as_str());
    let targetTs = target.get("updatedAt").and_then(|v| v.as_str());
    match (sourceTs, targetTs) {
      (Some(s), Some(t)) => s > t,
      _ => true,
    }
  }

  #[allow(non_snake_case)]
  fn getId(value: &Value) -> Option<String> {
    value
      .get("id")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string())
  }

  #[allow(non_snake_case)]
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let mongodb_provider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let todos = match mongodb_provider
      .getAllByField("todos", Some(doc! {"userId": &userId}), None)
      .await
    {
      Ok(docs) => docs,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting todos: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    let todoIds: Vec<String> = todos
      .iter()
      .filter_map(|doc| doc.get_str("id").ok())
      .map(|s| s.to_string())
      .collect();

    let tasks = if !todoIds.is_empty() {
      match mongodb_provider
        .getAllByField("tasks", Some(doc! {"todoId": {"$in": &todoIds}}), None)
        .await
      {
        Ok(docs) => docs,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting tasks: {}", e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    } else {
      vec![]
    };
    let taskIds: Vec<String> = tasks
      .iter()
      .filter_map(|doc| doc.get_str("id").ok())
      .map(|s| s.to_string())
      .collect();

    let subtasks = if !taskIds.is_empty() {
      match mongodb_provider
        .getAllByField("subtasks", Some(doc! {"taskId": {"$in": &taskIds}}), None)
        .await
      {
        Ok(docs) => docs,
        Err(e) => {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error getting subtasks: {}", e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    } else {
      vec![]
    };

    let categories = match mongodb_provider
      .getAllByField("categories", Some(doc! {"userId": &userId}), None)
      .await
    {
      Ok(docs) => docs,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting categories: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let dailyActivities = match mongodb_provider
      .getAllByField("daily_activities", Some(doc! {"userId": &userId}), None)
      .await
    {
      Ok(docs) => docs,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting daily_activities: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let dataSets = vec![
      ("todos", todos),
      ("tasks", tasks),
      ("subtasks", subtasks),
      ("categories", categories),
      ("daily_activities", dailyActivities),
    ];

    for (table, docs) in dataSets {
      for doc in docs {
        let id = doc.get_str("id").unwrap_or_default();
        let value = serde_json::to_value(&doc).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting document to value: {}", e),
          data: DataValue::String("".to_string()),
        })?;
        match self.jsonProvider.getByField(table, None, None, &id).await {
          Ok(existing_val) => {
            if Self::shouldUpdateTarget(&value, &existing_val) {
              if let Err(e) = self.jsonProvider.update(table, &id, value).await {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: format!("Error updating record in {}: {}", table, e),
                  data: DataValue::String("".to_string()),
                });
              }
            }
          }
          Err(_) => {
            if let Err(e) = self.jsonProvider.create(table, value).await {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error creating record in {}: {}", table, e),
                data: DataValue::String("".to_string()),
              });
            }
          }
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Data imported to local JSON DB successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  #[allow(non_snake_case)]
  pub async fn exportToCloud(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let mongodb_provider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let todos = match self
      .jsonProvider
      .getAllByField("todos", Some(json!({"userId": userId})), None)
      .await
    {
      Ok(vals) => vals,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting todos from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    let todoIds: Vec<String> = todos
      .iter()
      .filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
      .collect();

    let tasks = match self
      .jsonProvider
      .getAllByField("tasks", Some(json!({"todoId": todoIds})), None)
      .await
    {
      Ok(vals) => vals,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting tasks from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    let taskIds: Vec<String> = tasks
      .iter()
      .filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
      .collect();

    let subtasks = match self
      .jsonProvider
      .getAllByField("subtasks", Some(json!({"taskId": taskIds})), None)
      .await
    {
      Ok(vals) => vals,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting subtasks from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let categories = match self
      .jsonProvider
      .getAllByField(
        "categories",
        Some(serde_json::json!({"userId": userId})),
        None,
      )
      .await
    {
      Ok(vals) => vals,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting categories from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let dailyActivities = match self
      .jsonProvider
      .getAllByField(
        "daily_activities",
        Some(serde_json::json!({"userId": userId})),
        None,
      )
      .await
    {
      Ok(vals) => vals,
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting daily_activities from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let dataSets = vec![
      ("todos", todos),
      ("tasks", tasks),
      ("subtasks", subtasks),
      ("categories", categories),
      ("daily_activities", dailyActivities),
    ];

    for (table, values) in dataSets {
      for mut value in values {
        let id = Self::getId(&value).unwrap_or_default();
        if let Some(obj) = value.as_object_mut() {
          obj.remove("_id");
        }
        match mongodb_provider.getByField(table, None, None, &id).await {
          Ok(existing_doc) => {
            let existing_val = serde_json::to_value(&existing_doc).map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting existing document to value: {}", e),
              data: DataValue::String("".to_string()),
            })?;
            if Self::shouldUpdateTarget(&value, &existing_val) {
              let doc: Document = from_bson(to_bson(&value).map_err(|e| ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error converting value to bson: {}", e),
                data: DataValue::String("".to_string()),
              })?)
              .map_err(|e| ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error converting bson to document: {}", e),
                data: DataValue::String("".to_string()),
              })?;
              if let Err(e) = mongodb_provider.update(table, &id, doc).await {
                return Err(ResponseModel {
                  status: ResponseStatus::Error,
                  message: format!("Error updating record in {}: {}", table, e),
                  data: DataValue::String("".to_string()),
                });
              }
            }
          }
          Err(_) => {
            let doc: Document = from_bson(to_bson(&value).map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting value to bson: {}", e),
              data: DataValue::String("".to_string()),
            })?)
            .map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting bson to document: {}", e),
              data: DataValue::String("".to_string()),
            })?;
            if let Err(e) = mongodb_provider.create(table, doc).await {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: format!("Error creating record in {}: {}", table, e),
                data: DataValue::String("".to_string()),
              });
            }
          }
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Data exported to cloud MongoDB successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }
}
