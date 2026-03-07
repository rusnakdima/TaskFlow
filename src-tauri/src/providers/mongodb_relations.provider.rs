/* sys lib */
use mongodb::bson::{doc, Document};

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

/* providers */
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

  pub async fn getDataRelations(
    &self,
    mut record: Document,
    relations: Vec<RelationObj>,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne => {
          if let Some(value) = record.get(&relation.nameField).cloned() {
            if let Some(idStr) = value.as_str() {
              let result = match self.mongodbCrud.get(&relation.nameTable, None, idStr).await {
                Ok(doc) => doc,
                Err(_) => continue,
              };
              // Recursively apply relations to the related document if needed
              let enrichedResult = if let Some(subRelations) = relation.relations {
                Box::pin(self.getDataRelations(result, subRelations)).await?
              } else {
                result
              };
              record.insert(relation.newNameField.clone(), enrichedResult);
            }
          }
        }
        TypesField::OneToMany => {
          if let Some(idValue) = record.get("id").cloned() {
            if let Some(idStr) = idValue.as_str() {
              let filter = doc! { &relation.nameField: idStr };
              let result = match self
                .mongodbCrud
                .getAll(&relation.nameTable, Some(filter))
                .await
              {
                Ok(records) => records,
                Err(_) => continue,
              };

              let mut enrichedRecords = Vec::new();
              if let Some(subRelations) = relation.relations {
                for rec in result {
                  enrichedRecords
                    .push(Box::pin(self.getDataRelations(rec, subRelations.clone())).await?);
                }
              } else {
                enrichedRecords = result;
              }

              record.insert(relation.newNameField.clone(), enrichedRecords);
            }
          }
        }
        TypesField::ManyToOne => {
          if let Ok(value) = record.get_array(&relation.nameField).cloned() {
            let mut listResult: Vec<Document> = vec![];
            for id in value {
              if let Some(idStr) = id.as_str() {
                let result = match self.mongodbCrud.get(&relation.nameTable, None, idStr).await {
                  Ok(doc) => doc,
                  Err(_) => continue,
                };

                let enrichedResult = if let Some(subRelations) = relation.relations.clone() {
                  Box::pin(self.getDataRelations(result, subRelations)).await?
                } else {
                  result
                };
                listResult.push(enrichedResult);
              }
            }
            record.insert(relation.newNameField.clone(), listResult);
          }
        }
        TypesField::ManyToMany => {
          if let Some(idValue) = record.get("id").cloned() {
            if let Some(idStr) = idValue.as_str() {
              let allRecords = match self.mongodbCrud.getAll(&relation.nameTable, None).await {
                Ok(records) => records,
                Err(_) => continue,
              };
              let mut filteredRecords: Vec<Document> = allRecords
                .into_iter()
                .filter(|doc| {
                  if let Ok(arr) = doc.get_array(&relation.nameField) {
                    arr.iter().any(|v| v.as_str() == Some(idStr))
                  } else {
                    false
                  }
                })
                .collect();

              if let Some(subRelations) = relation.relations {
                let mut enrichedRecords = Vec::new();
                for rec in filteredRecords {
                  enrichedRecords
                    .push(Box::pin(self.getDataRelations(rec, subRelations.clone())).await?);
                }
                filteredRecords = enrichedRecords;
              }

              record.insert(relation.newNameField.clone(), filteredRecords);
            }
          }
        }
      }
    }

    Ok(record)
  }
}
