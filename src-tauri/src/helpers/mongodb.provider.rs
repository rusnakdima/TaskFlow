/* sys lib */
use dotenv::dotenv;
use mongodb::{
  bson::{doc, Document},
  Client, Collection, Database,
};
use std::env;
use tauri::AppHandle;

/* models */
use crate::models::relation_obj::{RelationObj, TypesField};

#[derive(Clone)]
pub struct MongodbProvider {
  pub db: Database,
}

impl MongodbProvider {
  #[allow(non_snake_case)]
  pub async fn new(appHandle: AppHandle) -> Self {
    dotenv().ok();

    let uri = env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let database = env::var("MONGODB_NAME").expect("MONGODB_NAME must be set");
    let client = Client::with_uri_str(&uri).await.unwrap();

    Self {
      db: client.database(&database),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getDataTable(
    &self,
    nameTable: &str,
  ) -> Result<Collection<Document>, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.db.collection::<Document>(nameTable);
    Ok(tableData)
  }

  #[allow(non_snake_case)]
  pub async fn getDataRelations(
    &self,
    mut record: Document,
    relations: Vec<RelationObj>,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    for relation in relations {
      match relation.typeField {
        TypesField::OneToOne => {
          if let Some(value) = record.get(relation.nameField).cloned() {
            let result = match self
              .getByField(
                &relation.nameTable,
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
                &relation.nameTable,
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
                  &relation.nameTable,
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
    nameTable: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
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

    if let Some(relations) = relations {
      let mut enrichedResults = Vec::new();
      for result in results {
        let enriched = Box::pin(self.getDataRelations(result, relations.clone())).await?;
        enrichedResults.push(enriched);
      }
      results = enrichedResults;
    }

    Ok(results)
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameTable: &str,
    filter: Option<Document>,
    relations: Option<Vec<RelationObj>>,
    id: &str,
  ) -> Result<Document, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = match filter {
      Some(filter) => filter,
      None => {
        doc! { "id": id.to_string() }
      }
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
      Err(e) => {
        return Err(Box::new(e));
      }
    };

    let enrichedResult = if let Some(relations) = relations {
      Box::pin(self.getDataRelations(result, relations.clone())).await?
    } else {
      result
    };

    Ok(enrichedResult)
  }

  #[allow(non_snake_case)]
  pub async fn create(
    &self,
    nameTable: &str,
    document: Document,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    tableData.insert_one(document).await?;

    Ok(true)
  }

  #[allow(non_snake_case)]
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

  #[allow(non_snake_case)]
  pub async fn delete(
    &self,
    nameTable: &str,
    id: &str,
  ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let tableData = self.getDataTable(nameTable).await?;
    let filter = doc! { "id": id.to_string() };
    tableData.delete_one(filter).await?;

    Ok(true)
  }
}
