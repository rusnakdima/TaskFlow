/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/* crate */
use crate::entities::task_entity::TaskEntity;

/* nosql_orm */
use nosql_orm::error::{OrmError, OrmResult};
use nosql_orm::prelude::{Entity, EntityMeta, RelationDef, SoftDeletable, WithRelations};
use nosql_orm::sql::types::SqlOnDelete;
use nosql_orm::validators::Validate as OrmValidate;
use nosql_orm::Validate;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoEntity {
  pub id: Option<String>,
  pub user_id: String,
  pub title: String,
  pub description: String,
  pub start_date: Option<String>,
  pub end_date: Option<String>,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  pub visibility: String,
  pub priority: String,
  pub order: i32,
  #[serde(skip_deserializing)]
  pub tasks: Vec<TaskEntity>,
  #[serde(default)]
  pub created_at: DateTime<Utc>,
  #[serde(default)]
  pub updated_at: DateTime<Utc>,
  #[serde(default)]
  pub deleted_at: Option<DateTime<Utc>>,
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
    self.deleted_at
  }

  fn set_deleted_at(&mut self, deleted_at: Option<DateTime<Utc>>) {
    self.deleted_at = deleted_at;
  }
}

impl WithRelations for TodoEntity {
  fn relations() -> Vec<RelationDef> {
    vec![
      RelationDef::one_to_many("tasks", "tasks", "todo_id").on_delete(SqlOnDelete::Cascade),
      RelationDef::one_to_many("chats", "chats", "todo_id").on_delete(SqlOnDelete::Cascade),
      RelationDef::many_to_one("user", "users", "user_id"),
      RelationDef::many_to_many("categories", "categories", "categories"),
      RelationDef::many_to_one_array("assignees_profiles", "profiles", "assignees")
        .transform_map("user_id", "profiles", "id"),
    ]
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct TodoCreateModel {
  #[validate(not_empty)]
  pub user_id: String,
  #[validate(not_empty)]
  pub title: String,
  pub description: String,
  pub start_date: String,
  pub end_date: String,
  pub categories: Vec<String>,
  pub assignees: Vec<String>,
  #[validate(not_empty)]
  pub visibility: String,
  pub priority: String,
  pub order: i32,
}

impl From<TodoCreateModel> for TodoEntity {
  fn from(value: TodoCreateModel) -> Self {
    let now = Utc::now();
    let formatted_start_date = if value.start_date.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.start_date) {
      Some(
        dt.with_timezone(&Utc)
          .format("%Y-%m-%dT%H:%M:%SZ")
          .to_string(),
      )
    } else {
      None
    };
    let formatted_end_date = if value.end_date.is_empty() {
      None
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&value.end_date) {
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
      user_id: value.user_id,
      title: value.title,
      description: value.description,
      start_date: formatted_start_date,
      end_date: formatted_end_date,
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
  pub user_id: Option<String>,
  #[serde(default)]
  pub title: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub start_date: Option<String>,
  #[serde(default)]
  pub end_date: Option<String>,
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

impl OrmValidate for TodoUpdateModel {
  fn validate(&self) -> OrmResult<()> {
    if let Some(ref title) = self.title {
      if title.is_empty() {
        return Err(OrmError::Validation("title cannot be empty".to_string()));
      }
    }
    if let Some(ref visibility) = self.visibility {
      if visibility.is_empty() {
        return Err(OrmError::Validation(
          "visibility cannot be empty".to_string(),
        ));
      }
    }
    Ok(())
  }
}
