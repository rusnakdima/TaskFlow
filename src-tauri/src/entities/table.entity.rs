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

macro_rules! validate_model_case {
  ($create_model_type:ty, $entity_type:ty, $label:expr, $data:expr, $is_create:expr, $visibility:expr) => {{
    if $is_create {
      let create_model: $create_model_type = serde_json::from_value($data.clone())
        .map_err(|e| format!("Invalid {} data: {}", $label, e))?;
      create_model.validate().map_err(|e| e.to_string())?;
      let model: $entity_type = create_model.into();
      Ok(inject_visibility(
        serialize_for_insert(&model, $label)?,
        $visibility,
      ))
    } else {
      Ok(inject_visibility(
        with_update_timestamp($data.clone()),
        $visibility,
      ))
    }
  }};
}

macro_rules! validate_model_case_with_preprocess {
  ($create_model_type:ty, $entity_type:ty, $label:expr, $data:expr, $is_create:expr, $visibility:expr, $preprocess:ident) => {{
    if $is_create {
      let filtered_data = $preprocess($data.clone());
      let create_model: $create_model_type = serde_json::from_value(filtered_data)
        .map_err(|e| format!("Invalid {} data: {}", $label, e))?;
      create_model.validate().map_err(|e| e.to_string())?;
      let model: $entity_type = create_model.into();
      Ok(inject_visibility(
        serialize_for_insert(&model, $label)?,
        $visibility,
      ))
    } else {
      Ok(inject_visibility(
        with_update_timestamp($data.clone()),
        $visibility,
      ))
    }
  }};
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
    TableModelType::Chat => validate_model_case!(
      ChatCreateModel,
      ChatEntity,
      "chat",
      data,
      is_create,
      visibility
    ),
    TableModelType::Todo => validate_model_case!(
      TodoCreateModel,
      TodoEntity,
      "todo",
      data,
      is_create,
      visibility
    ),
    TableModelType::Task => validate_model_case!(
      TaskCreateModel,
      TaskEntity,
      "task",
      data,
      is_create,
      visibility
    ),
    TableModelType::Subtask => validate_model_case!(
      SubtaskCreateModel,
      SubtaskEntity,
      "subtask",
      data,
      is_create,
      visibility
    ),
    TableModelType::Category => validate_model_case!(
      CategoryCreateModel,
      CategoryEntity,
      "category",
      data,
      is_create,
      visibility
    ),
    TableModelType::User => validate_model_case!(
      UserCreateModel,
      UserEntity,
      "user",
      data,
      is_create,
      visibility
    ),
    TableModelType::Profile => validate_model_case_with_preprocess!(
      ProfileCreateModel,
      ProfileEntity,
      "profile",
      data,
      is_create,
      visibility,
      filter_empty_fields
    ),
    TableModelType::DailyActivity => validate_model_case!(
      DailyActivityCreateModel,
      DailyActivityModel,
      "daily activity",
      data,
      is_create,
      visibility
    ),
    TableModelType::Comment => validate_model_case!(
      CommentCreateModel,
      CommentEntity,
      "comment",
      data,
      is_create,
      visibility
    ),
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
