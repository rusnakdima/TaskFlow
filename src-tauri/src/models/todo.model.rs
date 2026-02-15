/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::{category_model::CategoryFullModel, user_model::UserFullModel};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
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
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoCreateModel {
  pub userId: String,
  pub title: String,
  pub description: String,
  pub startDate: String,
  pub endDate: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub visibility: String,
  pub order: i32,
}

#[allow(non_snake_case)]
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
      order: value.order,
      isDeleted: false,
      createdAt: formatted.clone(),
      updatedAt: formatted.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoUpdateModel {
  pub _id: Option<ObjectId>,
  pub id: String,
  pub userId: Option<String>,
  pub title: Option<String>,
  pub description: Option<String>,
  pub startDate: Option<String>,
  pub endDate: Option<String>,
  pub categories: Option<Vec<String>>,
  pub assignees: Option<Vec<String>>,
  pub visibility: Option<String>,
  pub order: Option<i32>,
  pub isDeleted: Option<bool>,
  pub createdAt: Option<String>,
  pub updatedAt: String,
}

#[allow(non_snake_case)]
impl TodoUpdateModel {
  pub fn applyTo(&self, existing: TodoModel) -> TodoModel {
    let mut formattedStartDate = existing.startDate.clone();
    let mut formattedEndDate = existing.endDate.clone();

    if let Some(ref startDate) = self.startDate {
      if !startDate.is_empty() {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(startDate) {
          let utc = dt.with_timezone(&chrono::Utc);
          formattedStartDate = utc.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        }
      }
    }

    if let Some(ref endDate) = self.endDate {
      if !endDate.is_empty() {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(endDate) {
          let utc = dt.with_timezone(&chrono::Utc);
          formattedEndDate = utc.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        }
      }
    }

    let now = chrono::Utc::now();
    let formatted = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    TodoModel {
      _id: existing._id,
      id: existing.id,
      userId: self.userId.clone().unwrap_or(existing.userId),
      title: self.title.clone().unwrap_or(existing.title),
      description: self.description.clone().unwrap_or(existing.description),
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      categories: self.categories.clone().unwrap_or(existing.categories),
      assignees: self.assignees.clone().unwrap_or(existing.assignees),
      visibility: self.visibility.clone().unwrap_or(existing.visibility),
      order: self.order.unwrap_or(existing.order),
      isDeleted: self.isDeleted.unwrap_or(existing.isDeleted),
      createdAt: existing.createdAt,
      updatedAt: formatted,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct TodoFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub user: UserFullModel,
  pub title: String,
  pub description: String,
  pub startDate: String,
  pub endDate: String,
  pub categories: Vec<CategoryFullModel>,
  pub assignees: Vec<UserFullModel>,
  pub order: i32,
  pub isDeleted: bool,
  pub createdAt: String,
  pub updatedAt: String,
}
