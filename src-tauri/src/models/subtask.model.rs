/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::{
  sync_metadata_model::SyncMetadata,
  task_model::TaskStatus,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskModel {
  pub _id: ObjectId,
  pub id: String,
  pub taskId: String,
  pub title: String,
  pub description: String,
  pub status: TaskStatus,
  pub priority: String,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskCreateModel {
  pub taskId: String,
  pub title: String,
  pub description: Option<String>,
  pub priority: String,
  pub order: i32,
  #[serde(rename = "_syncMetadata")]
  pub sync_metadata: Option<SyncMetadata>,
}

impl SubtaskCreateModel {
  pub fn validate(&self) -> Result<(), String> {
    if self.taskId.is_empty() {
      return Err("taskId cannot be empty".to_string());
    }
    if self.title.is_empty() {
      return Err("title cannot be empty".to_string());
    }
    if self.priority.is_empty() {
      return Err("priority cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<SubtaskCreateModel> for SubtaskModel {
  fn from(value: SubtaskCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    SubtaskModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      taskId: value.taskId,
      title: value.title,
      description: value.description.unwrap_or_default(),
      status: TaskStatus::Pending,
      priority: value.priority.to_string(),
      order: value.order,
      isDeleted: false,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtaskUpdateModel {
  pub _id: Option<ObjectId>,
  pub id: String,
  pub taskId: Option<String>,
  pub title: Option<String>,
  pub description: Option<String>,
  pub status: Option<TaskStatus>,
  pub priority: Option<String>,
  pub order: Option<i32>,
  pub isDeleted: Option<bool>,
  pub createdAt: Option<String>,
  pub updatedAt: String,
  #[serde(rename = "_syncMetadata")]
  pub sync_metadata: Option<SyncMetadata>,
}

impl SubtaskUpdateModel {
  pub fn validate(&self) -> Result<(), String> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err("title cannot be empty".to_string());
      }
    }
    if let Some(ref priority) = self.priority {
      if priority.is_empty() {
        return Err("priority cannot be empty".to_string());
      }
    }
    Ok(())
  }
}
