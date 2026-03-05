/* sys lib */
use serde_json::{json, Value};

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

/* providers */
use super::json_crud_provider::JsonCrudProvider;

/// JsonRelationsProvider - Handle data relations for JSON provider
#[derive(Clone)]
pub struct JsonRelationsProvider {
  pub jsonCrud: JsonCrudProvider,
}

impl JsonRelationsProvider {
  pub fn new(jsonCrud: JsonCrudProvider) -> Self {
    Self { jsonCrud }
  }

  pub async fn getDataRelations(
    &self,
    mut record: Value,
    relations: Vec<RelationObj>,
  ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(recordObj) = record.as_object_mut() {
      for relation in relations {
        match relation.typeField {
          TypesField::OneToOne => {
            if let Some(value) = recordObj.get(&relation.nameField).cloned() {
              if let Some(idStr) = value.as_str() {
                let result = match self.jsonCrud.get(&relation.nameTable, None, idStr).await {
                  Ok(doc) => doc,
                  Err(_) => continue,
                };
                recordObj.insert(relation.newNameField.clone(), result);
              }
            }
          }
          TypesField::OneToMany => {
            if let Some(idValue) = recordObj.get("id").cloned() {
              if let Some(idStr) = idValue.as_str() {
                let filter = json!({ relation.nameField: idStr });
                let result = match self
                  .jsonCrud
                  .getAll(&relation.nameTable, Some(filter))
                  .await
                {
                  Ok(records) => Value::Array(records),
                  Err(_) => continue,
                };
                recordObj.insert(relation.newNameField.clone(), result);
              }
            }
          }
          TypesField::ManyToOne => {
            if let Some(arrayValue) = recordObj.get(&relation.nameField).cloned() {
              if let Some(ids) = arrayValue.as_array() {
                let mut listResult: Vec<Value> = vec![];
                for id in ids {
                  if let Some(idStr) = id.as_str() {
                    let result = match self.jsonCrud.get(&relation.nameTable, None, idStr).await {
                      Ok(doc) => doc,
                      Err(_) => continue,
                    };
                    listResult.push(result);
                  }
                }
                recordObj.insert(relation.newNameField.clone(), Value::Array(listResult));
              }
            }
          }
          TypesField::ManyToMany => {
            if let Some(idValue) = recordObj.get("id").cloned() {
              if let Some(idStr) = idValue.as_str() {
                let allRecords = match self.jsonCrud.getAll(&relation.nameTable, None).await {
                  Ok(records) => records,
                  Err(_) => continue,
                };
                let filteredRecords: Vec<Value> = allRecords
                  .into_iter()
                  .filter(|record| {
                    if let Some(fieldValue) = record.get(&relation.nameField) {
                      if let Some(arr) = fieldValue.as_array() {
                        arr.iter().any(|v| v.as_str() == Some(idStr))
                      } else {
                        false
                      }
                    } else {
                      false
                    }
                  })
                  .collect();
                recordObj.insert(relation.newNameField.clone(), Value::Array(filteredRecords));
              }
            }
          }
        }
      }
    }

    Ok(record)
  }
}
