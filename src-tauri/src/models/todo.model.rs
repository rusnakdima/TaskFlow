/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

use crate::models::traits::Validatable;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoModel {
  pub _id: ObjectId,
  pub id: String,
  pub userId: String,
  pub title: String,
  pub description: String,
  pub startDate: String,
  pub endDate: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub visibility: String,
  pub priority: String,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoCreateModel {
  pub userId: String,
  pub title: String,
  pub description: String,
  pub startDate: String,
  pub endDate: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub visibility: String,
  pub priority: String,
  pub order: i32,
}

impl Validatable for TodoCreateModel {
  fn validate(&self) -> Result<(), String> {
    if self.userId.is_empty() {
      return Err("userId cannot be empty".to_string());
    }
    if self.title.is_empty() {
      return Err("title cannot be empty".to_string());
    }
    if self.visibility.is_empty() {
      return Err("visibility cannot be empty".to_string());
    }
    Ok(())
  }
}

impl From<TodoCreateModel> for TodoModel {
  fn from(value: TodoCreateModel) -> Self {
    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let mut formattedStartDate = String::new();
    let mut formattedEndDate = String::new();
    if value.startDate != "" {
      if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.startDate) {
        formattedStartDate = dt
          .with_timezone(&chrono::Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string();
      }
    }
    if value.endDate != "" {
      if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.endDate) {
        formattedEndDate = dt
          .with_timezone(&chrono::Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string();
      }
    }

    TodoModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      userId: value.userId,
      title: value.title,
      description: value.description,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      categories: value.categories,
      assignees: value.assignees,
      visibility: value.visibility,
      priority: value.priority,
      order: value.order,
      isDeleted: false,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoUpdateModel {
  #[serde(default)]
  pub _id: Option<ObjectId>,
  #[serde(default)]
  pub id: Option<String>,
  #[serde(default)]
  pub userId: Option<String>,
  #[serde(default)]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub startDate: Option<String>,
  #[serde(default)]
  pub endDate: Option<String>,
  #[serde(default)]
  pub categories: Option<Vec<String>>,
  #[serde(default)]
  pub assignees: Option<Vec<String>>,
  #[serde(default)]
  pub visibility: Option<String>,
  #[serde(default)]
  pub priority: Option<String>,
  #[serde(default)]
  pub order: Option<i32>,
  #[serde(default)]
  pub isDeleted: Option<bool>,
  #[serde(default)]
  pub createdAt: Option<String>,
  #[serde(default)]
  pub updatedAt: Option<String>,
}

impl Validatable for TodoUpdateModel {
  fn validate(&self) -> Result<(), String> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err("title cannot be empty".to_string());
      }
    }
    if let Some(ref visibility) = self.visibility {
      if visibility.is_empty() {
        return Err("visibility cannot be empty".to_string());
      }
    }
    Ok(())
  }
}
