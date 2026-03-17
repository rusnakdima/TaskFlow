/* sys lib */
use serde_json::Value;
use std::collections::HashMap;

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

  pub async fn handleRelations(
    &self,
    data: &mut Value,
    relations: &Vec<RelationObj>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut cache = HashMap::new();
    self
      .handleRelationsWithCache(data, relations, &mut cache)
      .await
  }

  pub async fn handleRelationsWithCache(
    &self,
    data: &mut Value,
    relations: &Vec<RelationObj>,
    cache: &mut HashMap<String, Vec<Value>>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne | TypesField::ManyToOne => {
          if let Some(ids_val) = data.get(&relation.nameField) {
            let target_field = relation.targetField.as_deref().unwrap_or("id");
            if let Some(ids_arr) = ids_val.as_array() {
              // Case: Array of IDs (e.g. categories in todo)
              let mut records = Vec::new();
              for id_val in ids_arr {
                if let Some(id_str) = id_val.as_str() {
                  // Use cache if available
                  let table_data = if let Some(cached) = cache.get(&relation.nameTable) {
                    cached
                  } else {
                    let fresh_data = self.jsonCrud.getDataTable(&relation.nameTable).await?;
                    cache.insert(relation.nameTable.clone(), fresh_data);
                    cache.get(&relation.nameTable).unwrap()
                  };

                  // Find record in table data using target_field
                  let record_opt = table_data
                    .iter()
                    .find(|r| r.get(target_field).and_then(|v| v.as_str()) == Some(id_str));

                  if let Some(record) = record_opt {
                    let mut record_clone = record.clone();
                    // Recurse for nested relations
                    if let Some(sub_relations) = &relation.relations {
                      let _ = Box::pin(self.handleRelationsWithCache(
                        &mut record_clone,
                        sub_relations,
                        cache,
                      ))
                      .await;
                    }
                    records.push(record_clone);
                  }
                }
              }
              if let Some(obj) = data.as_object_mut() {
                obj.insert(relation.newNameField.clone(), Value::Array(records));
              }
            } else if let Some(id_str) = ids_val.as_str() {
              // Case: Single ID
              if !id_str.is_empty() {
                // Use cache if available
                let table_data = if let Some(cached) = cache.get(&relation.nameTable) {
                  cached
                } else {
                  let fresh_data = self.jsonCrud.getDataTable(&relation.nameTable).await?;
                  cache.insert(relation.nameTable.clone(), fresh_data);
                  cache.get(&relation.nameTable).unwrap()
                };

                // Find record in table data using target_field
                let record_opt = table_data
                  .iter()
                  .find(|r| r.get(target_field).and_then(|v| v.as_str()) == Some(id_str));

                let mut result = match record_opt {
                  Some(doc) => doc.clone(),
                  None => Value::Null,
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
        }
        TypesField::OneToMany => {
          if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
            // Use cache if available
            let table_data = if let Some(cached) = cache.get(&relation.nameTable) {
              cached
            } else {
              let fresh_data = self.jsonCrud.getDataTable(&relation.nameTable).await?;
              cache.insert(relation.nameTable.clone(), fresh_data);
              cache.get(&relation.nameTable).unwrap()
            };

            // Filter records that match the parent ID
            let mut records: Vec<Value> = table_data
              .iter()
              .filter(|r| r.get(&relation.nameField).and_then(|v| v.as_str()) == Some(id))
              .cloned()
              .collect();

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

            // Use cache if available
            let table_data = if let Some(cached) = cache.get(&relation.nameTable) {
              cached
            } else {
              let fresh_data = self.jsonCrud.getDataTable(&relation.nameTable).await?;
              cache.insert(relation.nameTable.clone(), fresh_data);
              cache.get(&relation.nameTable).unwrap()
            };

            let mut filteredRecords: Vec<Value> = table_data
              .iter()
              .filter(|record: &&Value| {
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
