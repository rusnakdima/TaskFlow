use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentModel {
  #[serde(default)]
  pub _id: Option<ObjectId>,
  #[serde(default)]
  pub id: Option<String>,
  pub authorId: String,
  pub authorName: String,
  pub content: String,
  pub createdAt: String,
  pub updatedAt: String,
  #[serde(default)]
  pub taskId: Option<String>,
  #[serde(default)]
  pub subtaskId: Option<String>,
  #[serde(default)]
  pub readBy: Vec<String>,
}

impl CommentModel {
  #[allow(dead_code)]
  pub fn new(
    authorId: String,
    authorName: String,
    content: String,
    taskId: Option<String>,
    subtaskId: Option<String>,
  ) -> Self {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    Self {
      _id: Some(ObjectId::new()),
      id: Some(Uuid::new().to_string()),
      authorId: authorId.clone(),
      authorName,
      content,
      createdAt: now.clone(),
      updatedAt: now,
      taskId,
      subtaskId,
      readBy: vec![authorId],
    }
  }
}
