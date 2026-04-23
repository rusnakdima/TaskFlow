/* sys lib */
use serde_json::{Map, Value};

// Import all model types
use crate::entities::{
  category_entity::{CategoryCreateModel, CategoryEntity, CategoryUpdateModel},
  chat_entity::{ChatCreateModel, ChatEntity, ChatUpdateModel},
  comment_entity::{CommentCreateModel, CommentEntity, CommentUpdateModel},
  daily_activity_entity::{DailyActivityCreateModel, DailyActivityModel},
  profile_entity::{ProfileCreateModel, ProfileEntity, ProfileUpdateModel},
  subtask_entity::{SubtaskCreateModel, SubtaskEntity, SubtaskUpdateModel},
  task_entity::{TaskCreateModel, TaskEntity, TaskUpdateModel},
  todo_entity::{TodoCreateModel, TodoEntity, TodoUpdateModel},
  traits::Validatable,
  user_entity::{UserCreateModel, UserEntity, UserUpdateModel},
};

/// Convert camelCase keys to snake_case recursively in a JSON value
fn convert_camel_to_snake(value: Value) -> Value {
  match value {
    Value::Object(map) => {
      let converted: Map<String, Value> = map
        .into_iter()
        .map(|(k, v)| {
          let snake_key = to_snake_case(&k);
          (snake_key, convert_camel_to_snake(v))
        })
        .collect();
      Value::Object(converted)
    }
    Value::Array(arr) => Value::Array(arr.into_iter().map(convert_camel_to_snake).collect()),
    other => other,
  }
}

/// Convert a camelCase string to snake_case
/// e.g., "userId" -> "user_id", "createdAt" -> "created_at"
fn to_snake_case(s: &str) -> String {
  let mut result = String::with_capacity(s.len());
  for (i, c) in s.chars().enumerate() {
    if c.is_uppercase() && i > 0 {
      result.push('_');
    }
    result.extend(c.to_lowercase());
  }
  result
}

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
pub fn validate_model(table_name: &str, data: &Value, is_create: bool) -> Result<Value, String> {
  let model_type = validate_table(table_name)?;

  if !data.is_object() {
    return Err("Data must be a JSON object".to_string());
  }

  // Convert camelCase keys to snake_case before deserializing
  let data = convert_camel_to_snake(data.clone());

  match model_type {
    TableModelType::Chat => {
      if is_create {
        let create_model: ChatCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid chat data: {}", e))?;
        create_model.validate()?;
        let model: ChatEntity = create_model.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize chat model: {}", e))
      } else {
        let update_model: ChatUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid chat update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Todo => {
      if is_create {
        let create_model: TodoCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid todo data: {}", e))?;
        create_model.validate()?;
        let model: TodoEntity = create_model.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize todo model: {}", e))
      } else {
        let update_model: TodoUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid todo update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Task => {
      if is_create {
        let create_model: TaskCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid task data: {}", e))?;
        create_model.validate()?;
        let model: TaskEntity = create_model.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize task model: {}", e))
      } else {
        let update_model: TaskUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid task update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Subtask => {
      if is_create {
        let create_model: SubtaskCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid subtask data: {}", e))?;
        create_model.validate()?;
        let model: SubtaskEntity = create_model.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize subtask model: {}", e))
      } else {
        let update_model: SubtaskUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid subtask update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Category => {
      if is_create {
        let create_model: CategoryCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid category data: {}", e))?;
        create_model.validate()?;
        let model: CategoryEntity = create_model.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize category model: {}", e))
      } else {
        let update_model: CategoryUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid category update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::User => {
      if is_create {
        let create_model: UserCreateModel =
          serde_json::from_value(data.clone()).map_err(|e| format!("Invalid user data: {}", e))?;
        create_model.validate()?;
        let model: UserEntity = create_model.into();
        serde_json::to_value(&model).map_err(|e| format!("Failed to serialize user model: {}", e))
      } else {
        let update_model: UserUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid user update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::Profile => {
      if is_create {
        let filtered_data = filter_empty_fields(data.clone());
        let create_model: ProfileCreateModel = serde_json::from_value(filtered_data)
          .map_err(|e| format!("Invalid profile data: {}", e))?;
        create_model.validate()?;
        let model: ProfileEntity = create_model.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize profile model: {}", e))
      } else {
        let update_model: ProfileUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid profile update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
    TableModelType::DailyActivity => {
      if is_create {
        let create_model: DailyActivityCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid daily activity data: {}", e))?;
        create_model.validate()?;
        let model: DailyActivityModel = create_model.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize daily activity model: {}", e))
      } else {
        // DailyActivity update - just return data as-is
        Ok(data.clone())
      }
    }
    TableModelType::Comment => {
      if is_create {
        let create_model: CommentCreateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid comment data: {}", e))?;
        create_model.validate()?;
        let model: CommentEntity = create_model.into();
        serde_json::to_value(&model)
          .map_err(|e| format!("Failed to serialize comment model: {}", e))
      } else {
        let update_model: CommentUpdateModel = serde_json::from_value(data.clone())
          .map_err(|e| format!("Invalid comment update data: {}", e))?;
        update_model.validate()?;
        Ok(data.clone())
      }
    }
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
