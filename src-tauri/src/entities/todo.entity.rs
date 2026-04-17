/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoEntity {
  pub id: Option<String>,
  pub userId: String,
  pub title: String,
  pub description: String,
  pub startDate: Option<String>,
  pub endDate: Option<String>,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub visibility: String,
  pub priority: String,
  pub order: i32,
  #[serde(skip_deserializing)]
  pub tasks: Vec<crate::entities::task_entity::TaskEntity>,
  pub deleted_at: Option<DateTime<Utc>>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl Entity for TodoEntity {
  fn meta() -> EntityMeta {
    EntityMeta::new("todos")
  }

  fn get_id(&self) -> Option<String> {
    self.id.clone()
  }

  fn set_id(&mut self, id: String) {
    self.id = Some(id);
  }

  fn is_soft_deletable() -> bool {
    true
  }
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

impl From<TodoCreateModel> for TodoEntity {
  fn from(value: TodoCreateModel) -> Self {
    let now = Utc::now();
    let formattedStartDate = if value.startDate.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.startDate) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };
    let formattedEndDate = if value.endDate.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.endDate) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };

    TodoEntity {
      id: None,
      userId: value.userId.clone(),
      title: value.title,
      description: value.description,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      categories: value.categories,
      assignees: value.assignees,
      visibility: value.visibility,
      priority: value.priority,
      order: value.order,
      tasks: vec![],
      deleted_at: None,
      created_at: now,
      updated_at: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoUpdateModel {
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
  pub deleted_at: Option<bool>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
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
