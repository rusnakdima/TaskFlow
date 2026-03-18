/* sys lib */
use futures_util::StreamExt;
use mongodb::{bson::doc, Database};
use serde_json::to_value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct LiveSyncService {
  pub db: Database,
  pub appHandle: AppHandle,
}

impl LiveSyncService {
  pub fn new(db: Database, appHandle: AppHandle) -> Self {
    Self { db, appHandle }
  }

  pub async fn startWatching(self: Arc<Self>) {
    let collections = vec![
      "tasks",
      "todos",
      "subtasks",
      "comments",
      "categories",
      "chats",
      "daily_activities",
    ];

    for collectionName in collections {
      let serviceClone = self.clone();
      let name = collectionName.to_string();

      tauri::async_runtime::spawn(async move {
        serviceClone.watchCollection(name).await;
      });
    }
  }

  async fn watchCollection(&self, collectionName: String) {
    let pipeline = vec![doc! {
      "$match": {
        "operationType": {
          "$in": ["insert", "update", "replace", "delete"]
        }
      }
    }];

    // Reconnect loop: re-opens the change stream after any error or cursor close (H-7)
    loop {
      let collection = self
        .db
        .collection::<mongodb::bson::Document>(&collectionName);

      let streamResult = collection
        .watch()
        .pipeline(pipeline.clone())
        .full_document(mongodb::options::FullDocumentType::UpdateLookup)
        .await;

      match streamResult {
        Ok(mut stream) => {
          while let Some(changeResult) = stream.next().await {
            match changeResult {
              Ok(change) => {
                let eventName = format!("db-change-{}", collectionName);
                if let Ok(changeJson) = to_value(&change) {
                  let _ = self.appHandle.emit(&eventName, changeJson);
                }
              }
              Err(_) => {
                // Stream error — break inner loop to trigger reconnect
                break;
              }
            }
          }
          // Stream ended (cursor closed or error) — wait before reconnecting
          tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
        Err(e) => {
          let errorMessage = e.to_string();
          if errorMessage.contains("40573") || errorMessage.contains("replica sets") {
            // MongoDB is not a Replica Set — Change Streams unavailable, stop trying
            return;
          }
          // Transient connection error — wait and retry
          tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
      }
    }
  }
}
