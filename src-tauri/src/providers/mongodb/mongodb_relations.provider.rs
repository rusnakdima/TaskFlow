/* sys lib */
use serde_json::Value;
use std::collections::HashMap;

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

/* providers */
use crate::providers::base_crud::CrudProvider;

use super::mongodb_crud_provider::MongodbCrudProvider;

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
    let mut cache: HashMap<String, Vec<Value>> = HashMap::new();
    self
      .handleRelationsWithCache(data, relations, &mut cache)
      .await
  }

  async fn handleRelationsWithCache(
    &self,
    data: &mut Value,
    relations: &Vec<RelationObj>,
    cache: &mut HashMap<String, Vec<Value>>,
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
                  let _ =
                    Box::pin(self.handleRelationsWithCache(&mut result, sub_relations, cache))
                      .await;
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
                    let _ =
                      Box::pin(self.handleRelationsWithCache(&mut record, sub_relations, cache))
                        .await;
                  }
                  records.push(record);
                }
              }
            }
            if let Some(obj) = data.as_object_mut() {
              obj.insert(relation.newNameField.clone(), Value::Array(records));
            }
          } else if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
            // Traditional One-to-Many (reverse lookup) - use cache keyed by "table:parentField:id"
            let cache_key = format!("{}:{}:{}", relation.nameTable, relation.nameField, id);
            let table_data = if let Some(cached) = cache.get(&cache_key) {
              cached
            } else {
              let filter = serde_json::json!({ relation.nameField.clone(): id });
              let fresh_data = self
                .mongodbCrud
                .getAll(&relation.nameTable, Some(filter))
                .await
                .unwrap_or_default();
              cache.insert(cache_key.clone(), fresh_data);
              cache.get(&cache_key).unwrap()
            };

            let mut records: Vec<Value> = table_data.clone();

            if let Some(sub_relations) = &relation.relations {
              for record in &mut records {
                let _ = Box::pin(self.handleRelationsWithCache(record, sub_relations, cache)).await;
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

            // Use cache to avoid re-fetching the entire table for each entity
            let table_data = if let Some(cached) = cache.get(&relation.nameTable) {
              cached
            } else {
              let fresh_data = self
                .mongodbCrud
                .getAll(&relation.nameTable, None)
                .await
                .unwrap_or_default();
              cache.insert(relation.nameTable.clone(), fresh_data);
              cache.get(&relation.nameTable).unwrap()
            };

            let mut filteredRecords: Vec<Value> = table_data
              .iter()
              .filter(|val| {
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
              .cloned()
              .collect();

            if let Some(sub_relations) = &relation.relations {
              for record in &mut filteredRecords {
                let _ = Box::pin(self.handleRelationsWithCache(record, sub_relations, cache)).await;
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
