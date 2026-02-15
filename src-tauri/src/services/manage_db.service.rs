/* sys */
use mongodb::bson::{doc, from_bson, to_bson, Document};
use serde_json::{json, Value};
use std::sync::Arc;

/* helpers */
use crate::helpers::{
  common::convertDataToObject, json_provider::JsonProvider, mongodb_provider::MongodbProvider,
};

/* models */
use crate::models::{
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

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
  pub async fn getAllDataFromCloud(
    &self,
    userId: String,
  ) -> Result<std::collections::HashMap<String, Vec<Document>>, ResponseModel> {
    let mongodbProvider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let mut result = std::collections::HashMap::new();

    let todos = match mongodbProvider
      .getAll(
        "todos",
        Some(doc! {"userId": &userId, "isDeleted": {"$ne": true}}),
        None,
      )
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
    result.insert("todos".to_string(), todos);

    let todoIds: Vec<String> = result
      .get("todos")
      .unwrap_or(&vec![])
      .iter()
      .filter_map(|v: &Document| v.get_str("id").ok().map(|s| s.to_string()))
      .collect();

    let tasks = if !todoIds.is_empty() {
      match mongodbProvider
        .getAll("tasks", Some(doc! {"todoId": {"$in": &todoIds}}), None)
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
    result.insert("tasks".to_string(), tasks);

    let taskIds: Vec<String> = result
      .get("tasks")
      .unwrap_or(&vec![])
      .iter()
      .filter_map(|v: &Document| v.get_str("id").ok().map(|s| s.to_string()))
      .collect();

    let subtasks = if !taskIds.is_empty() {
      match mongodbProvider
        .getAll("subtasks", Some(doc! {"taskId": {"$in": &taskIds}}), None)
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
    result.insert("subtasks".to_string(), subtasks);

    let categories = match mongodbProvider
      .getAll(
        "categories",
        Some(doc! {"userId": &userId, "isDeleted": {"$ne": true}}),
        None,
      )
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
    result.insert("categories".to_string(), categories);

    let dailyActivities = match mongodbProvider
      .getAll(
        "daily_activities",
        Some(doc! {"userId": &userId, "isDeleted": {"$ne": true}}),
        None,
      )
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
    result.insert("daily_activities".to_string(), dailyActivities);

    Ok(result)
  }

  #[allow(non_snake_case)]
  pub async fn getAllDataFromLocal(
    &self,
    userId: String,
  ) -> Result<std::collections::HashMap<String, Vec<Value>>, ResponseModel> {
    let mut result = std::collections::HashMap::new();

    let todos = match self
      .jsonProvider
      .getAll("todos", Some(json!({"userId": userId.clone()})), None)
      .await
    {
      Ok(vals) => vals
        .into_iter()
        .filter(|v| v.get("isDeleted").and_then(|v| v.as_bool()) != Some(true))
        .collect(),
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting todos from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    result.insert("todos".to_string(), todos);

    let todoIds: Vec<String> = result
      .get("todos")
      .unwrap_or(&vec![])
      .iter()
      .filter_map(|v: &Value| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
      .collect();

    let tasks = match self
      .jsonProvider
      .getAll("tasks", Some(json!({"todoId": todoIds})), None)
      .await
    {
      Ok(vals) => vals
        .into_iter()
        .filter(|v| v.get("isDeleted").and_then(|v| v.as_bool()) != Some(true))
        .collect(),
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting tasks from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    result.insert("tasks".to_string(), tasks);

    let taskIds: Vec<String> = result
      .get("tasks")
      .unwrap_or(&vec![])
      .iter()
      .filter_map(|v: &Value| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
      .collect();

    let subtasks = match self
      .jsonProvider
      .getAll("subtasks", Some(json!({"taskId": taskIds})), None)
      .await
    {
      Ok(vals) => vals
        .into_iter()
        .filter(|v| v.get("isDeleted").and_then(|v| v.as_bool()) != Some(true))
        .collect(),
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting subtasks from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    result.insert("subtasks".to_string(), subtasks);

    let categories = match self
      .jsonProvider
      .getAll(
        "categories",
        Some(serde_json::json!({"userId": userId.clone()})),
        None,
      )
      .await
    {
      Ok(vals) => vals
        .into_iter()
        .filter(|v| v.get("isDeleted").and_then(|v| v.as_bool()) != Some(true))
        .collect(),
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting categories from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    result.insert("categories".to_string(), categories);

    let dailyActivities = match self
      .jsonProvider
      .getAll(
        "daily_activities",
        Some(serde_json::json!({"userId": userId})),
        None,
      )
      .await
    {
      Ok(vals) => vals
        .into_iter()
        .filter(|v| v.get("isDeleted").and_then(|v| v.as_bool()) != Some(true))
        .collect(),
      Err(e) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error getting daily_activities from JSON: {}", e),
          data: DataValue::String("".to_string()),
        });
      }
    };
    result.insert("daily_activities".to_string(), dailyActivities);

    Ok(result)
  }

  #[allow(non_snake_case)]
  pub async fn importToLocal(&self, userId: String) -> Result<ResponseModel, ResponseModel> {
    let cloudData = match self.getAllDataFromCloud(userId.clone()).await {
      Ok(data) => data,
      Err(e) => return Err(e),
    };

    let localData = match self.getAllDataFromLocal(userId.clone()).await {
      Ok(data) => data,
      Err(e) => return Err(e),
    };

    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    let mut allToUpsert: std::collections::HashMap<String, Vec<Value>> =
      std::collections::HashMap::new();

    for table in &tables {
      let cloud = cloudData.get(*table).cloned().unwrap_or(vec![]);
      let local = localData.get(*table).cloned().unwrap_or(vec![]);

      let mut cloudMap: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
      for doc in &cloud {
        let value = serde_json::to_value(doc).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error converting cloud doc to value: {}", e),
          data: DataValue::String("".to_string()),
        })?;
        if let Some(id) = value.get("id").and_then(|i| i.as_str()) {
          cloudMap.insert(id.to_string(), value);
        }
      }

      let mut localMap: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
      for v in &local {
        if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
          localMap.insert(id.to_string(), v.clone());
        }
      }

      let mut toUpsert = vec![];

      for (id, cloudVal) in &cloudMap {
        let needsUpdate = if let Some(localVal) = localMap.get(id) {
          Self::shouldUpdateTarget(cloudVal, localVal)
        } else {
          true
        };

        if needsUpdate {
          toUpsert.push(cloudVal.clone());
        }
      }

      allToUpsert.insert(table.to_string(), toUpsert);
    }

    for (table, values) in allToUpsert {
      if !values.is_empty() {
        if let Err(e) = self.jsonProvider.updateAll(&table, values).await {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error upserting records in {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
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
    let mongodbProvider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

    let mut deletedByTable: std::collections::HashMap<String, Vec<Document>> =
      std::collections::HashMap::new();
    for table in &tables {
      let allLocal = match self.jsonProvider.getDataTable(table).await {
        Ok(recs) => recs,
        Err(_) => continue,
      };
      for record in allLocal {
        if record.get("isDeleted").and_then(|v| v.as_bool()) == Some(true) {
          if let Some(id) = record.get("id").and_then(|v| v.as_str()) {
            let mut doc: Document = from_bson(to_bson(&record).map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting record to bson: {}", e),
              data: DataValue::String("".to_string()),
            })?)
            .map_err(|e| ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error converting bson to document: {}", e),
              data: DataValue::String("".to_string()),
            })?;
            doc.insert("isDeleted", true);
            deletedByTable
              .entry(table.to_string())
              .or_insert(Vec::new())
              .push(doc);
            let _ = self.jsonProvider.hardDelete(table, &id).await;
          }
        }
      }
    }

    for (table, docs) in deletedByTable {
      if let Err(e) = mongodbProvider.updateAll(&table, docs).await {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error updating deleted records in {}: {}", table, e),
          data: DataValue::String("".to_string()),
        });
      }
    }

    let localData = match self.getAllDataFromLocal(userId.clone()).await {
      Ok(data) => data,
      Err(e) => return Err(e),
    };
    let cloudData = match self.getAllDataFromCloud(userId).await {
      Ok(data) => data,
      Err(e) => return Err(e),
    };

    let mut allToUpsert: std::collections::HashMap<String, Vec<Document>> =
      std::collections::HashMap::new();

    for table in &tables {
      let local = localData.get(*table).cloned().unwrap_or(vec![]);
      let cloud = cloudData.get(*table).cloned().unwrap_or(vec![]);

      let mut localMap: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
      for v in &local {
        if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
          localMap.insert(id.to_string(), v.clone());
        }
      }

      let mut cloudMap: std::collections::HashMap<String, Document> =
        std::collections::HashMap::new();
      for d in &cloud {
        if let Some(id) = d.get_str("id").ok() {
          cloudMap.insert(id.to_string(), d.clone());
        }
      }

      let mut toUpsert = vec![];

      for (id, localVal) in &localMap {
        let needsUpdate = if let Some(cloudDoc) = cloudMap.get(id) {
          let cloudVal = serde_json::to_value(cloudDoc).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error converting cloud doc to value: {}", e),
            data: DataValue::String("".to_string()),
          })?;
          Self::shouldUpdateTarget(localVal, &cloudVal)
        } else {
          true
        };

        if needsUpdate {
          let doc: Document = from_bson(to_bson(localVal).map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error converting local val to bson: {}", e),
            data: DataValue::String("".to_string()),
          })?)
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error converting bson to document: {}", e),
            data: DataValue::String("".to_string()),
          })?;
          toUpsert.push(doc);
        }
      }

      for (id, mut cloudDoc) in cloudMap {
        if !localMap.contains_key(&id) {
          cloudDoc.insert("isDeleted", true);
          toUpsert.push(cloudDoc);
        }
      }

      allToUpsert.insert(table.to_string(), toUpsert);
    }

    for (table, docs) in allToUpsert {
      if !docs.is_empty() {
        if let Err(e) = mongodbProvider.updateAll(&table, docs).await {
          return Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error upserting records in {}: {}", table, e),
            data: DataValue::String("".to_string()),
          });
        }
      }
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Data exported to cloud MongoDB successfully".to_string(),
      data: DataValue::String("".to_string()),
    })
  }

  #[allow(non_snake_case)]
  pub async fn getAllDataForAdmin(&self) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    let tables = vec![
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "daily_activities",
    ];

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
    ];

    let mut allData = serde_json::Map::new();

    for table in tables {
      let relations = if table == "todos" {
        Some(todoRelations.clone())
      } else if table == "categories" {
        Some(userRelations.clone())
      } else {
        None
      };
      let docs = match mongodbProvider.getAll(table, None, relations).await {
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
      allData.insert(table.to_string(), serde_json::Value::Array(values));
    }

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "All data retrieved for admin".to_string(),
      data: convertDataToObject(&allData),
    })
  }

  #[allow(non_snake_case)]
  pub async fn permanentlyDeleteRecord(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    match mongodbProvider.delete(&table, &id).await {
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

  #[allow(non_snake_case)]
  pub async fn toggleDeleteStatus(
    &self,
    table: String,
    id: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let mongodbProvider = match &self.mongodbProvider {
      Some(p) => p,
      None => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: "MongoDB not available".to_string(),
          data: DataValue::String("".to_string()),
        });
      }
    };

    // First get the record to know current status
    let record = match mongodbProvider.get(&table, None, None, &id).await {
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

    let update_doc = doc! { "isDeleted": new_status };

    match mongodbProvider.update(&table, &id, update_doc).await {
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
