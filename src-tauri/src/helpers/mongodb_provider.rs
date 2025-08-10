/* sys lib */
use dotenv::dotenv;
use mongodb::{
  bson::{doc, from_document, Document, Uuid},
  Client, Collection, Database,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::env;

use crate::models::list_models::ListFullModels;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub enum TypesField {
  One,
  Many,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct RelationObj {
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

  pub async fn connect_to_db(&self) -> Result<Database, Box<dyn std::error::Error>> {
    let client = Client::with_uri_str(&self.uri).await?;
    Ok(client.database(&self.database))
  }

  pub async fn get_collection<T>(
    &self,
    collection_name: &str,
  ) -> Result<Collection<T>, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    let db = self.connect_to_db().await?;
    let collection_doc = db.collection::<T>(collection_name);
    Ok(collection_doc)
  }

  #[allow(non_snake_case)]
  pub async fn get_data_relations<T>(
    &self,
    collection_name: &str,
    record: &mut Document,
    fields: &[&str],
    // relations: Vec<String>,
  ) -> Result<Document, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    // for relation in relations {
    //   match relation.typeField {
    //     TypesField::One => {
    //       let collection = self.get_collection(collection_name).await?;
    //       let uuid_id = Uuid::parse_str(record["id"].as_str().unwrap())?;
    //       let filter = doc! { "id": uuid_id };
    //       let mut result = match collection.find_one(filter).await {
    //         Ok(doc_opt) => match doc_opt {
    //           Some(doc) => doc,
    //           None => {
    //             return Err(Box::new(std::io::Error::new(
    //               std::io::ErrorKind::NotFound,
    //               "Document not found",
    //             )))
    //           }
    //         },
    //         Err(e) => {
    //           return Err(Box::new(e));
    //         }
    //       };
    //       record.insert(relation.newNameField.clone(), result);

    //       // let data_doc = self
    //       //   .get_by_id(
    //       //     collection_name,
    //       //     relation.relations,
    //       //     &relation.nameField.as_str(),
    //       //   )
    //       //   .await?;
    //       // record.insert(relation.newNameField.clone(), data_doc);
    //     }
    //     TypesField::Many => {
    //       let collection = self.get_collection(collection_name).await?;
    //       let filter = doc! { relation.nameField.clone(): record[&relation.nameField.clone().as_str()].clone() };
    //       let mut cursor = collection.find(filter).await?;

    //       let mut results: Vec<Document> = Vec::new();
    //       while cursor.advance().await? {
    //         let doc = cursor.deserialize_current()?;
    //         results.push(doc);
    //       }
    //       record.insert(relation.newNameField.clone(), results);

    //       // let list_docs = self
    //       //   .get_all_by_filter(
    //       //     collection_name,
    //       //     doc! { relation.nameField.clone(): record[relation.nameField.clone().as_str()].clone() },
    //       //     relation.relations,
    //       //   )
    //       //   .await?;
    //       // record.insert(relation.newNameField.to_string(), list_docs);
    //     }
    //   };
    // }

    Ok(record.clone())
  }

  pub async fn get_all<T>(
    &self,
    collection_name: &str,
    filter: Option<Document>,
    relations: Option<Vec<String>>,
  ) -> Result<Vec<T>, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    let collection = self.get_collection::<T>(collection_name).await?;
    let mut cursor = match filter {
      Some(filter) => collection.find(filter).await?,
      None => collection.find(doc! {}).await?,
    };

    let mut results: Vec<T> = Vec::new();
    while cursor.advance().await? {
      let doc = cursor.deserialize_current()?;
      results.push(doc);
    }

    // if let Some(relations) = relations {
    //   for result in &mut results {
    //     self
    //       .get_data_relations(collection_name, result, relations.to_vec())
    //       .await?;
    //   }
    // }

    Ok(results)
  }

  pub async fn get_by_field<T>(
    &self,
    collection_name: &str,
    filter: Option<Document>,
    relations: Option<Vec<String>>,
    id: &str,
  ) -> Result<T, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    let collection = self.get_collection::<T>(collection_name).await?;
    let filter = match filter {
      Some(filter) => filter,
      None => {
        let uuid_id = Uuid::parse_str(id)?;
        doc! { "id": uuid_id }
      }
    };

    let mut result = match collection.find_one(filter).await {
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

    // if let Some(relations) = relations {
    //   self
    //     .get_data_relations(collection_name, &mut result, relations.to_vec())
    //     .await?;
    // }

    Ok(result)
  }

  pub async fn create<T>(
    &self,
    collection_name: &str,
    data: Document,
  ) -> Result<bool, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    let collection = self.get_collection::<Document>(collection_name).await?;
    collection.insert_one(data).await?;

    Ok(true)
  }

  pub async fn update<T>(
    &self,
    collection_name: &str,
    id: &str,
    data: Document,
  ) -> Result<bool, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    let collection = self.get_collection::<T>(collection_name).await?;
    let uuid_id = Uuid::parse_str(id)?;
    let filter = doc! { "id": uuid_id };
    let update = doc! { "$set": data };
    collection.update_one(filter, update).await?;

    Ok(true)
  }

  pub async fn delete<T>(
    &self,
    collection_name: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error>>
  where
    T: DeserializeOwned + Unpin + Send + Sync,
  {
    let collection = self.get_collection::<T>(collection_name).await?;
    let uuid_id = Uuid::parse_str(id)?;
    let filter = doc! { "id": uuid_id };
    collection.delete_one(filter).await?;

    Ok(true)
  }
}
