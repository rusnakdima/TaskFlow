/* sys lib */
use dotenv::dotenv;
use mongodb::{
  bson::{doc, Document},
  Client, Collection, Database,
};
use std::env;

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

  pub async fn get_collection(
    &self,
    collection_name: &str,
  ) -> Result<Collection<Document>, Box<dyn std::error::Error>> {
    let db = self.connect_to_db().await?;
    let collection: Collection<Document> = db.collection::<Document>(collection_name);
    Ok(collection)
  }

  pub async fn get_all(
    &self,
    collection_name: &str,
  ) -> Result<Vec<Document>, Box<dyn std::error::Error>> {
    let collection = self.get_collection(collection_name).await?;
    let mut cursor = collection.find(doc! {}).await?;

    let mut results: Vec<Document> = Vec::new();
    while cursor.advance().await? {
      let doc = cursor.deserialize_current()?;
      results.push(doc);
    }

    Ok(results)
  }

  pub async fn get_by_id(
    &self,
    collection_name: &str,
    id: &str,
  ) -> Result<Option<Document>, Box<dyn std::error::Error>> {
    let collection = self.get_collection(collection_name).await?;
    let object_id = mongodb::bson::oid::ObjectId::parse_str(id)?;
    let filter = doc! { "_id": object_id };
    let result = collection.find_one(filter).await?;
    Ok(result)
  }

  pub async fn create(
    &self,
    collection_name: &str,
    data: Document,
  ) -> Result<bool, Box<dyn std::error::Error>> {
    let collection = self.get_collection(collection_name).await?;
    let _result = collection.insert_one(data).await?;
    Ok(true)
  }

  pub async fn update(
    &self,
    collection_name: &str,
    id: &str,
    data: Document,
  ) -> Result<bool, Box<dyn std::error::Error>> {
    let collection = self.get_collection(collection_name).await?;
    let object_id = mongodb::bson::oid::ObjectId::parse_str(id)?;
    let filter = doc! { "_id": object_id };
    let update = doc! { "$set": data };
    let _result = collection.update_one(filter, update).await?;
    Ok(true)
  }

  pub async fn delete(
    &self,
    collection_name: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error>> {
    let collection = self.get_collection(collection_name).await?;
    let object_id = mongodb::bson::oid::ObjectId::parse_str(id)?;
    let filter = doc! { "_id": object_id };
    let _result = collection.delete_one(filter).await?;
    Ok(true)
  }
}
