/* sys lib */
use futures_util::StreamExt;
use mongodb::{bson::doc, Database};
use serde_json::to_value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[allow(dead_code)]
pub struct LiveSyncService {
  pub db: Database,
  pub app_handle: AppHandle,
}

impl LiveSyncService {
  #[allow(dead_code)]
  pub fn new(db: Database, app_handle: AppHandle) -> Self {
    Self { db, app_handle }
  }

  #[allow(dead_code)]
  pub async fn start_watching(self: Arc<Self>) {
    let collections = vec![
      "tasks",
      "todos",
      "subtasks",
      "comments",
      "categories",
      "chats",
      "daily_activities",
    ];

    for collection_name in collections {
      let service_clone = self.clone();
      let name = collection_name.to_string();

      tauri::async_runtime::spawn(async move {
        service_clone.watch_collection(name).await;
      });
    }
  }

  #[allow(dead_code)]
  async fn watch_collection(&self, collection_name: String) {
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
        .collection::<mongodb::bson::Document>(&collection_name);

      let stream_result = collection
        .watch()
        .pipeline(pipeline.clone())
        .full_document(mongodb::options::FullDocumentType::UpdateLookup)
        .await;

      match stream_result {
        Ok(mut stream) => {
          while let Some(change_result) = stream.next().await {
            match change_result {
              Ok(change) => {
                let event_name = format!("db-change-{}", collection_name);
                if let Ok(change_json) = to_value(&change) {
                  let _ = self.app_handle.emit(&event_name, change_json);
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
          let error_message = e.to_string();
          if error_message.contains("40573") || error_message.contains("replica sets") {
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
