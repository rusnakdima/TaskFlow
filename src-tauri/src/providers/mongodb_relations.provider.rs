/* sys lib */
use serde_json::Value;

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

/* providers */
use super::mongodb_crud_provider::MongodbCrudProvider;
use crate::providers::base_crud::CrudProvider;

/// MongodbRelationsProvider - Handle data relations for MongoDB provider
#[derive(Clone)]
pub struct MongodbRelationsProvider {
  pub mongodbCrud: MongodbCrudProvider,
}

impl MongodbRelationsProvider {
  pub fn new(mongodbCrud: MongodbCrudProvider) -> Self {
    Self { mongodbCrud }
  }

  pub async fn handleRelations(
    &self,
    data: &mut Value,
    relations: &Vec<RelationObj>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne | TypesField::ManyToOne => {
          if let Some(id) = data.get(&relation.nameField).and_then(|v| v.as_str()) {
            if !id.is_empty() {
              let mut result = match self.mongodbCrud.get(&relation.nameTable, id).await {
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
        TypesField::OneToMany => {
          // If the field is an array of IDs in the current object (e.g., categories in todo)
          if let Some(ids_arr) = data.get(&relation.nameField).and_then(|v| v.as_array()) {
            let mut records = Vec::new();
            for id_val in ids_arr {
              if let Some(id_str) = id_val.as_str() {
                if let Ok(mut record) = self.mongodbCrud.get(&relation.nameTable, id_str).await {
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
          } else if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
            // Traditional One-to-Many (reverse lookup)
            let filter = serde_json::json!({ relation.nameField.clone(): id });
            let mut records: Vec<Value> = match self
              .mongodbCrud
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
            // TODO: Optimization - should use a proper MongoDB query instead of fetching all
            let allRecords: Vec<Value> =
              match self.mongodbCrud.getAll(&relation.nameTable, None).await {
                Ok(recs) => recs,
                Err(_) => Vec::new(),
              };

            let mut filteredRecords: Vec<Value> = allRecords
              .into_iter()
              .filter(|val: &Value| {
                if let Some(field_val) = val.get(&relation.nameField) {
                  if let Some(arr) = field_val.as_array() {
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
