/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::entities::traits::Validatable;
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
  pub deletedAt: Option<DateTime<Utc>>,
  pub createdAt: DateTime<Utc>,
  pub updatedAt: DateTime<Utc>,
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

impl SoftDeletable for TodoEntity {
  fn deleted_at(&self) -> Option<DateTime<Utc>> {
    self.deletedAt
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deletedAt = deleted_at;
  }
}

impl WithRelations for TodoEntity {
  fn relations() -> Vec<RelationDef> {
    vec![
      RelationDef::one_to_many("tasks", "tasks", "todoId"),
      RelationDef::one_to_many("chats", "chats", "todoId"),
      RelationDef::many_to_one("user", "users", "userId"),
      RelationDef::many_to_many("categories", "categories", "categories"),
    ]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    let formatted_start_date = if value.startDate.is_empty() {
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
    let formatted_end_date = if value.endDate.is_empty() {
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
      userId: value.userId,
      title: value.title,
      description: value.description,
      startDate: formatted_start_date,
      endDate: formatted_end_date,
      categories: value.categories,
      assignees: value.assignees,
      visibility: value.visibility,
      priority: value.priority,
      order: value.order,
      tasks: vec![],
      deletedAt: None,
      createdAt: now,
      updatedAt: now,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
  pub deletedAt: Option<bool>,
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