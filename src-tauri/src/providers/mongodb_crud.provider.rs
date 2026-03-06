/* sys lib */
use mongodb::{
  bson::{doc, Document},
  Collection, Database,
};

/// MongodbCrudProvider - CRUD operations for MongoDB
#[derive(Clone)]
pub struct MongodbCrudProvider {
  pub db: Database,
}

impl MongodbCrudProvider {
  pub fn new(db: Database) -> Self {
    Self { db }
  }

  pub async fn getDataTable(
    &self,
    nameTable: &str,
  ) -> Result<Collection<Document>, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.db.collection::<Document>(nameTable);
    Ok(tableData)
  }

  pub async fn getAll(
    &self,
    nameTable: &str,
    filter: Option<Document>,
  ) -> Result<Vec<Document>, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    let mut cursor = match filter {
      Some(filter) => tableData.find(filter).await?,
      None => tableData.find(doc! {}).await?,
    };

    let mut results: Vec<Document> = Vec::new();
    while cursor.advance().await? {
      let doc = cursor.deserialize_current()?;
      results.push(doc);
    }

    Ok(results)
  }

  pub async fn get(
    &self,
    nameTable: &str,
    filter: Option<Document>,
    id: &str,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = match filter {
      Some(filter) => filter,
      None => doc! { "id": id.to_string() },
    };

    let result = match tableData.find_one(filter).await {
      Ok(docOpt) => match docOpt {
        Some(doc) => doc,
        None => {
          return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Document not found",
          )))
        }
      },
      Err(e) => return Err(Box::new(e)),
    };

    Ok(result)
  }

  pub async fn create(
    &self,
    nameTable: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    tableData.insert_one(document).await?;
    Ok(true)
  }

  pub async fn update(
    &self,
    nameTable: &str,
    id: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };
    let update = doc! { "$set": document };
    tableData.update_one(filter, update).await?;
    Ok(true)
  }

  pub async fn updateAll(
    &self,
    nameTable: &str,
    documents: Vec<Document>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if documents.is_empty() {
      return Ok(());
    }

    let tableData = self.getDataTable(nameTable).await?;

    for mut doc in documents {
      let id = doc.get_str("id").unwrap_or_default();
      let filter = doc! { "id": id };

      doc.remove("_id");

      let update = doc! { "$set": doc };
      let options = mongodb::options::UpdateOptions::builder()
        .upsert(true)
        .build();

      tableData
        .update_one(filter, update)
        .with_options(options)
        .await?;
    }

    Ok(())
  }

  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };
    let update = doc! { "$set": { "isDeleted": true, "updatedAt": formatted } };
    tableData.update_one(filter, update).await?;
    Ok(true)
  }
}
