/* sys lib */
use serde_json::{Map, Value};

// Import all model types
use crate::entities::{
  category_entity::{CategoryCreateModel, CategoryEntity},
  chat_entity::{ChatCreateModel, ChatEntity},
  comment_entity::{CommentCreateModel, CommentEntity},
  daily_activity_entity::{DailyActivityCreateModel, DailyActivityModel},
  profile_entity::{ProfileCreateModel, ProfileEntity},
  subtask_entity::{SubtaskCreateModel, SubtaskEntity},
  task_entity::{TaskCreateModel, TaskEntity},
  todo_entity::{TodoCreateModel, TodoEntity},
  user_entity::{UserCreateModel, UserEntity},
};
use nosql_orm::prelude::apply_timestamps;
use nosql_orm::validators::Validate as OrmValidate;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum TableModelType {
  #[default]
  Todo,
  Task,
  Subtask,
  Category,
  User,
  Profile,
  DailyActivity,
  Chat,
  Comment,
}

impl TableModelType {
  pub const TABLE_TODOS: &'static str = "todos";
  pub const TABLE_TASKS: &'static str = "tasks";
  pub const TABLE_SUBTASKS: &'static str = "subtasks";
  pub const TABLE_CATEGORIES: &'static str = "categories";
  pub const TABLE_USERS: &'static str = "users";
  pub const TABLE_PROFILES: &'static str = "profiles";
  pub const TABLE_DAILY_ACTIVITIES: &'static str = "daily_activities";
  pub const TABLE_CHATS: &'static str = "chats";
  pub const TABLE_COMMENTS: &'static str = "comments";

  pub fn table_name(&self) -> &'static str {
    match self {
      TableModelType::Todo => Self::TABLE_TODOS,
      TableModelType::Task => Self::TABLE_TASKS,
      TableModelType::Subtask => Self::TABLE_SUBTASKS,
      TableModelType::Category => Self::TABLE_CATEGORIES,
      TableModelType::User => Self::TABLE_USERS,
      TableModelType::Profile => Self::TABLE_PROFILES,
      TableModelType::DailyActivity => Self::TABLE_DAILY_ACTIVITIES,
      TableModelType::Chat => Self::TABLE_CHATS,
      TableModelType::Comment => Self::TABLE_COMMENTS,
    }
  }
}

pub fn validate_table(table_name: &str) -> Result<TableModelType, String> {
  match table_name {
    "todos" => Ok(TableModelType::Todo),
    "tasks" => Ok(TableModelType::Task),
    "subtasks" => Ok(TableModelType::Subtask),
    "categories" => Ok(TableModelType::Category),
    "users" => Ok(TableModelType::User),
    "profiles" => Ok(TableModelType::Profile),
    "daily_activities" => Ok(TableModelType::DailyActivity),
    "chats" => Ok(TableModelType::Chat),
    "comments" => Ok(TableModelType::Comment),
    _ => Err(format!(
      "Table '{}' is not supported. Allowed tables: todos, tasks, subtasks, categories, users, profiles, daily_activities, chats, comments",
      table_name
    )),
  }
}

/// Validate data for create or update operation
/// Returns validated data ready for database operation
pub fn validate_model(
  table_name: &str,
  data: &Value,
  is_create: bool,
  visibility: Option<String>,
) -> Result<Value, String> {
  let model_type = validate_table(table_name)?;

  if !data.is_object() {
    return Err("Data must be a JSON object".to_string());
  }

  match model_type {
    TableModelType::Chat => {
      if is_create {
        let create_model: ChatCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid chat data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: ChatEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "chat")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::Todo => {
      if is_create {
        let create_model: TodoCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid todo data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: TodoEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "todo")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::Task => {
      if is_create {
        let create_model: TaskCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid task data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: TaskEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "task")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::Subtask => {
      if is_create {
        let create_model: SubtaskCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid subtask data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: SubtaskEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "subtask")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::Category => {
      if is_create {
        let create_model: CategoryCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid category data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: CategoryEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "category")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::User => {
      if is_create {
        let create_model: UserCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid user data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: UserEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "user")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::Profile => {
      if is_create {
        let filtered_data = filter_empty_fields(data.clone());
        let create_model: ProfileCreateModel = serde_json::from_value(filtered_data)
          .map_err(|e| format!("Invalid profile data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: ProfileEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "profile")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::DailyActivity => {
      if is_create {
        let create_model: DailyActivityCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid daily activity data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: DailyActivityModel = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "daily activity")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
    TableModelType::Comment => {
      if is_create {
        let create_model: CommentCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid comment data: {}", e))?;
        create_model.validate().map_err(|e| e.to_string())?;
        let model: CommentEntity = create_model.into();
        Ok(inject_visibility(
          serialize_for_insert(&model, "comment")?,
          visibility,
        ))
      } else {
        Ok(inject_visibility(
          with_update_timestamp(data.clone()),
          visibility,
        ))
      }
    }
  }
}

fn serialize_for_insert<T: serde::Serialize>(model: &T, label: &str) -> Result<Value, String> {
  let mut value = serde_json::to_value(model)
    .map_err(|e| format!("Failed to serialize {} model: {}", label, e))?;
  apply_timestamps(&mut value, true);
  Ok(value)
}

fn with_update_timestamp(mut value: Value) -> Value {
  apply_timestamps(&mut value, false);
  value
}

fn inject_visibility(value: Value, visibility: Option<String>) -> Value {
  if let Some(vis) = visibility {
    if let Value::Object(mut obj) = value {
      obj.insert("visibility".to_string(), Value::String(vis));
      Value::Object(obj)
    } else {
      value
    }
  } else {
    value
  }
}

fn filter_empty_fields(data: Value) -> Value {
  if let Value::Object(obj) = data {
    let filtered: Map<String, Value> = obj
      .into_iter()
      .filter(|(_, v)| match v {
        Value::String(s) => !s.is_empty(),
        Value::Null => false,
        _ => true,
      })
      .collect();
    Value::Object(filtered)
  } else {
    data
  }
}
