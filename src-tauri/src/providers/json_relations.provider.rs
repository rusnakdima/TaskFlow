/* sys lib */
use serde_json::Value;

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

/* providers */
use super::json_crud_provider::JsonCrudProvider;
use crate::providers::base_crud::CrudProvider;

/// JsonRelationsProvider - Handle data relations for JSON provider
#[derive(Clone)]
pub struct JsonRelationsProvider {
  pub jsonCrud: JsonCrudProvider,
}

impl JsonRelationsProvider {
  pub fn new(jsonCrud: JsonCrudProvider) -> Self {
    Self { jsonCrud }
  }

  pub async fn handleRelations(
    &self,
    data: &mut Value,
    relations: &Vec<RelationObj>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne | TypesField::ManyToOne => {
          if let Some(ids_val) = data.get(&relation.nameField) {
            if let Some(ids_arr) = ids_val.as_array() {
              // Case: Array of IDs (e.g. categories in todo)
              let mut records = Vec::new();
              for id_val in ids_arr {
                if let Some(id_str) = id_val.as_str() {
                  if let Ok(mut record) = self.jsonCrud.get(&relation.nameTable, id_str).await {
                    // Recurse for nested relations
                    if let Some(sub_relations) = &relation.relations {
                      let _ = Box::pin(self.handleRelations(&mut record, sub_relations)).await;
                    }
                    records.push(record);
                  }
                }
              }
              if let Some(obj) = data.as_object_mut() {
                obj.insert(relation.newNameField.clone(), Value::Array(records));
              }
            } else if let Some(id_str) = ids_val.as_str() {
              // Case: Single ID
              if !id_str.is_empty() {
                let mut result = match self.jsonCrud.get(&relation.nameTable, id_str).await {
                  Ok(doc) => doc,
                  Err(_) => Value::Null,
                };

                // Recurse for nested relations
                if let Some(sub_relations) = &relation.relations {
                  if !result.is_null() {
                    let _ = Box::pin(self.handleRelations(&mut result, sub_relations)).await;
                  }
                }

                if let Some(obj) = data.as_object_mut() {
                  obj.insert(relation.newNameField.clone(), result);
                }
              }
            }
          }
        }
        TypesField::OneToMany => {
          if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
            let filter = serde_json::json!({ relation.nameField.clone(): id });
            let mut records: Vec<Value> = match self
              .jsonCrud
              .getAll(&relation.nameTable, Some(filter))
              .await
            {
              Ok(recs) => recs,
              Err(_) => Vec::new(),
            };

            if let Some(sub_relations) = &relation.relations {
              for record in &mut records {
                let _ = Box::pin(self.handleRelations(record, sub_relations)).await;
              }
            }

            if let Some(obj) = data.as_object_mut() {
              obj.insert(relation.newNameField.clone(), Value::Array(records));
            }
          }
        }
        TypesField::ManyToMany => {
          if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
            let idStr = id.to_string();
            let allRecords: Vec<Value> = match self.jsonCrud.getAll(&relation.nameTable, None).await
            {
              Ok(recs) => recs,
              Err(_) => Vec::new(),
            };

            let mut filteredRecords: Vec<Value> = allRecords
              .into_iter()
              .filter(|record: &Value| {
                if let Some(fieldValue) = record.get(&relation.nameField) {
                  if let Some(arr) = fieldValue.as_array() {
                    arr.iter().any(|v| v.as_str() == Some(&idStr))
                  } else {
                    false
                  }
                } else {
                  false
                }
              })
              .collect();

            if let Some(sub_relations) = &relation.relations {
              for record in &mut filteredRecords {
                let _ = Box::pin(self.handleRelations(record, sub_relations)).await;
              }
            }

            if let Some(obj) = data.as_object_mut() {
              obj.insert(relation.newNameField.clone(), Value::Array(filteredRecords));
            }
          }
        }
      }
    }
    Ok(())
  }
}
