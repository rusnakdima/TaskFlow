/* sys lib */
use dotenv::dotenv;
use mongodb::{
  bson::{doc, Document, Uuid},
  Client, Collection, Database,
};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub enum TypesField {
  OneToOne,
  OneToMany,
  ManyToOne,
  ManyToMany,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct RelationObj {
  pub collection_name: String,
  pub typeField: TypesField,
  pub nameField: String,
  pub newNameField: String,
  pub relations: Option<Vec<RelationObj>>,
}

pub struct MongodbProvider {
  pub uri: String,
  pub database: String,
}

impl MongodbProvider {
  pub fn new() -> Self {
    dotenv().ok();
    Self {
      uri: env::var("MONGODB_URI").expect("MONGODB_URI must be set"),
      database: env::var("MONGODB_NAME").expect("MONGODB_NAME must be set"),
    }
  }

  #[allow(non_snake_case)]
  pub async fn connectToDB(&self) -> Result<Database, Box<dyn std::error::Error>> {
    let client = Client::with_uri_str(&self.uri).await?;
    Ok(client.database(&self.database))
  }

  #[allow(non_snake_case)]
  pub async fn getCollection(
    &self,
    collection_name: &str,
  ) -> Result<Collection<Document>, Box<dyn std::error::Error>> {
    let db = self.connectToDB().await?;
    let collection_doc = db.collection::<Document>(collection_name);
    Ok(collection_doc)
  }

  #[allow(non_snake_case)]
  pub async fn getDataRelations(
    &self,
    mut record: Document,
    relations: Vec<RelationObj>,
  ) -> Result<Document, Box<dyn std::error::Error>> {
    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne => {
          if let Some(value) = record.get(relation.nameField).cloned() {
            let result = match self
              .getByField(
                &relation.collection_name,
                None,
                relation.relations,
                &value.as_str().unwrap().to_string(),
              )
              .await
            {
              Ok(doc) => doc,
              Err(_) => continue,
            };
            record.insert(relation.newNameField.clone(), result);
          }
        }
        TypesField::OneToMany => {
          if let Some(value) = record.get("id").cloned() {
            let result = match self
              .getAllByField(
                &relation.collection_name,
                Some(doc! { relation.nameField: &value.as_str().unwrap().to_string() }),
                relation.relations,
              )
              .await
            {
              Ok(doc) => doc,
              Err(_) => continue,
            };
            record.insert(relation.newNameField.clone(), result);
          }
        }
        TypesField::ManyToOne => {
          if let Ok(value) = record.get_array(relation.nameField).cloned() {
            let mut listResult: Vec<Document> = vec![];
            for id in value {
              let result = match self
                .getByField(
                  &relation.collection_name,
                  None,
                  relation.relations.clone(),
                  &id.as_str().unwrap().to_string(),
                )
                .await
              {
                Ok(doc) => doc,
                Err(_) => continue,
              };
              listResult.push(result);
            }
            record.insert(relation.newNameField.clone(), listResult);
          }
        }
        TypesField::ManyToMany => {}
      }
    }

    Ok(record)
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    collection_name: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
  ) -> Result<Vec<Document>, Box<dyn std::error::Error>> {
    let collection = self.getCollection(collection_name).await?;
    let mut cursor = match filter {
      Some(filter) => collection.find(filter).await?,
      None => collection.find(doc! {}).await?,
    };

    let mut results: Vec<Document> = Vec::new();
    while cursor.advance().await? {
      let doc = cursor.deserialize_current()?;
      results.push(doc);
    }

    if let Some(relations) = relations {
      let mut enriched_results = Vec::new();
      for result in results {
        let enriched = Box::pin(self.getDataRelations(result, relations.clone())).await?;
        enriched_results.push(enriched);
      }
      results = enriched_results;
    }

    Ok(results)
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    collection_name: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
    id: &str,
  ) -> Result<Document, Box<dyn std::error::Error>> {
    let collection = self.getCollection(collection_name).await?;
    let filter = match filter {
      Some(filter) => filter,
      None => {
        let uuid_id = Uuid::parse_str(id)?;
        doc! { "id": uuid_id }
      }
    };

    let result = match collection.find_one(filter).await {
      Ok(doc_opt) => match doc_opt {
        Some(doc) => doc,
        None => {
          return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Document not found",
          )))
        }
      },
      Err(e) => {
        return Err(Box::new(e));
      }
    };

    let enriched_result = if let Some(relations) = relations {
      Box::pin(self.getDataRelations(result, relations.clone())).await?
    } else {
      result
    };

    Ok(enriched_result)
  }

  pub async fn create(
    &self,
    collection_name: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error>> {
    let collection = self.getCollection(collection_name).await?;
    collection.insert_one(document).await?;

    Ok(true)
  }

  pub async fn update(
    &self,
    collection_name: &str,
    id: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error>> {
    let collection = self.getCollection(collection_name).await?;
    let uuid_id = Uuid::parse_str(id)?;
    let filter = doc! { "id": uuid_id };
    let update = doc! { "$set": document };
    collection.update_one(filter, update).await?;

    Ok(true)
  }

  pub async fn delete(
    &self,
    collection_name: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error>> {
    let collection = self.getCollection(collection_name).await?;
    let uuid_id = Uuid::parse_str(id)?;
    let filter = doc! { "id": uuid_id };
    collection.delete_one(filter).await?;

    Ok(true)
  }
}
